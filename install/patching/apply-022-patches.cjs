// DSH 0.2.2-rc compatibility patches for the Fairy suite (idempotent).
//  1. dsh-fairy-voice  : the *16 icon exports were removed; alias to *Regular.
//  2. dsh-fairy-startup: workspaces.startSession()/baselinesReady/recentWorkspaceId were replaced
//                        by phase-based readiness + uiWorkspace.startSession().
//  3. settingsScope shim: follow the Host's `settings/document-updated` invalidation event.
//
// Usage: node apply-022-patches.cjs [--dry]
const fs = require('fs');
const path = require('path');

const DRY = process.argv.includes('--dry');
const MARKER = '/* DSH_FAIRY_022_PATCH */';
const ROOTS = [
  'C:\\Users\\shawn\\.dsh\\plugin-suite\\fairy-dsh',
  path.join('C:\\Users\\shawn\\OneDrive\\文档\\deepseek-harness\\default-workspace', 'fairy-dsh-install'),
];

let failures = 0;
function write(file, text, label) {
  if (DRY) { console.log(`would patch (${label}): ${file}`); return; }
  fs.writeFileSync(file, text, 'utf8');
  console.log(`patched (${label}): ${file}`);
}

// ---------------------------------------------------------------- voice icons
const VOICE_FROM = "const { Tooltip, IconPauseOutline16, IconPlayOutline16, IconStopFill16 } = require('@deepseek-ai/dsh-client-ui-primitives');";
const VOICE_TO = "const { Tooltip, IconPlayOutlineRegular: IconPlayOutline16, IconStopFillRegular: IconStopFill16 } = require('@deepseek-ai/dsh-client-ui-primitives'); /* DSH_FAIRY_022_PATCH: *16 icons removed in 0.2.2 */";

function patchVoice(file) {
  if (!fs.existsSync(file)) { console.log('skip (missing):', file); return; }
  let text = fs.readFileSync(file, 'utf8');
  if (text.includes('DSH_FAIRY_022_PATCH')) { console.log('skip (patched):', file); return; }
  if (!text.includes(VOICE_FROM)) { console.log('FAIL voice anchor:', file); failures++; return; }
  text = text.replace(VOICE_FROM, () => VOICE_TO);
  write(file, text, 'voice icons');
}

// --------------------------------------------------------------- startup port
const STARTUP_FROM = '    function createWorkspaceStarter(workspaces) {';
const STARTUP_END = '    return { apply, inject:';
const STARTUP_PORT = `    function workspaceReady(workspaces) {
      try {
        const list = workspaces && workspaces.list;
        if (list && typeof list.getSnapshot === 'function') {
          const snapshot = list.getSnapshot();
          if (snapshot && snapshot.phase !== undefined) {
            // DSH 0.2.2: readiness is phase-based and the workspace list must be non-empty.
            return snapshot.phase === 'ready' && (Array.isArray(snapshot.items) ? snapshot.items.length > 0 : true);
          }
          // DSH 0.1.x / 0.2.1: baseline-based readiness.
          if (snapshot && snapshot.baselinesReady !== undefined) {
            return snapshot.baselinesReady === true && snapshot.recentWorkspaceId !== undefined;
          }
        }
      } catch (error) {
        diagnostics.warn('workspace.readiness', {}, error);
      }
      return false;
    }

    function createWorkspaceStarter(workspaces, uiWorkspace) {
      let unsubscribe = null;
      let started = false;
      const startWhenReady = () => {
        if (started || !workspaceReady(workspaces)) return false;
        try {
          if (workspaces && typeof workspaces.startSession === 'function') {
            workspaces.startSession();
          } else if (uiWorkspace && typeof uiWorkspace.startSession === 'function') {
            uiWorkspace.startSession();
          } else {
            return false;
          }
        } catch (error) {
          diagnostics.error('session.start-fresh', {}, error);
          return false;
        }
        started = true;
        unsubscribe?.();
        unsubscribe = null;
        return true;
      };
      return {
        startOrSubscribe() {
          if (!startWhenReady()) {
            const list = workspaces && workspaces.list;
            if (list && typeof list.subscribe === 'function') unsubscribe = list.subscribe(startWhenReady);
          }
        },
        dispose() {
          unsubscribe?.();
        },
      };
    }

    function resetStartupSelection(ctx, sessions, workspaces) {
      const root = document.documentElement;
      if (root.hasAttribute(STARTUP_RESET_ATTR)) return null;
      root.setAttribute(STARTUP_RESET_ATTR, 'true');

      // Clear the restored selection synchronously so a previous conversation never
      // flashes. 0.2.2 changed the private selection store, so a failure here must not
      // take the plugin (and the web boot audit) down with it.
      try {
        if (sessions && typeof sessions.clear === 'function') sessions.clear();
      } catch (error) {
        root.removeAttribute(STARTUP_RESET_ATTR);
        diagnostics.error('session.clear-restored', {}, error);
        return null;
      }

      let uiWorkspace;
      try {
        uiWorkspace = ctx.uiWorkspace;
      } catch (error) {
        /* service absent: fall back to the workspaces controller */
      }
      const starter = createWorkspaceStarter(workspaces, uiWorkspace);
      starter.startOrSubscribe();
      return () => starter.dispose();
    }

    function apply(ctx) {
      return diagnostics.guard('apply', () => {
        const disposeReset = resetStartupSelection(ctx, ctx.sessions, ctx.workspaces);
        if (disposeReset) ctx.effect(() => disposeReset, 'dsh-fairy-startup reset selection');
      }, { surface: 'client' });
    }

`;

function patchStartup(file) {
  if (!fs.existsSync(file)) { console.log('skip (missing):', file); return; }
  let text = fs.readFileSync(file, 'utf8');
  if (text.includes('DSH_FAIRY_022_PATCH')) { console.log('skip (patched):', file); return; }
  const start = text.indexOf(STARTUP_FROM);
  const end = text.indexOf(STARTUP_END);
  if (start < 0 || end < 0 || end <= start) { console.log('FAIL startup anchors:', file); failures++; return; }
  text = text.slice(0, start) + STARTUP_PORT + text.slice(end);
  text = text.replace('window.__ModuleLoader__.load({', 'window.__ModuleLoader__.load({ ' + MARKER);
  write(file, text, 'startup port');
}

// ------------------------------------------------------------- shim invalidation
const SHIM_FROM = '          attachEngine(createEngine(face));';
const SHIM_TO = `          attachEngine(createEngine(face)); /* DSH_FAIRY_022_PATCH */
          try {
            if (remoteCtx.remote && typeof remoteCtx.remote.$on === 'function') {
              remoteCtx.effect(() => {
                const offUpdate = remoteCtx.remote.$on('settings/document-updated', () => {
                  try { if (engine !== undefined) void engine.load(); } catch (error) { warn('settings refresh failed', error); }
                });
                return () => { try { if (typeof offUpdate === 'function') offUpdate(); } catch { /* gone */ } };
              }, 'dsh-fairy-compat-settings-scope.invalidate');
            }
          } catch (error) {
            warn('could not subscribe to settings invalidation', error);
          }`;

function patchShim(file) {
  if (!fs.existsSync(file)) { console.log('skip (missing):', file); return; }
  let text = fs.readFileSync(file, 'utf8');
  if (text.includes('DSH_FAIRY_022_PATCH')) { console.log('skip (patched):', file); return; }
  if (!text.includes(SHIM_FROM)) { console.log('FAIL shim anchor:', file); failures++; return; }
  text = text.replace(SHIM_FROM, () => SHIM_TO);
  write(file, text, 'shim invalidation');
}

for (const root of ROOTS) {
  patchVoice(path.join(root, 'node_modules', 'dsh-fairy-voice', 'lib', 'client.js'));
  patchStartup(path.join(root, 'node_modules', 'dsh-fairy-startup', 'lib', 'client.js'));
  patchShim(path.join(root, 'compat', 'dsh-fairy-compat-settings-scope', 'lib', 'client.js'));
}

console.log(failures ? `FAILURES=${failures}` : 'OK');
process.exit(failures ? 1 : 0);
