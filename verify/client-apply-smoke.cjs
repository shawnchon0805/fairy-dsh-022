// Client-side apply smoke test: loads each patched Fairy client bundle with a stubbed browser,
// calls its `apply(ctx)` against a stubbed cordis client context, and asserts the expected
// registrations happen without throwing. This catches the runtime errors that
// `node --check` cannot (missing service, removed icon export, changed snapshot shape).
//
// Usage: node client-apply-smoke.mjs <treeRoot>
const fs = require('fs');
const path = require('path');

const tree = path.resolve(process.argv[2] || 'C:\\Users\\shawn\\.dsh\\plugin-suite\\fairy-dsh');

/* ---------------------------------------------------------------- DOM stubs */
function makeEl(tag = 'div') {
  const attrs = new Map();
  const el = {
    tagName: String(tag).toUpperCase(),
    style: { setProperty() {}, removeProperty() {}, getPropertyValue() { return ''; } },
    dataset: {},
    children: [],
    attributes: attrs,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute(k, v) { attrs.set(k, String(v)); },
    getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
    hasAttribute(k) { return attrs.has(k); },
    removeAttribute(k) { attrs.delete(k); },
    appendChild(c) { this.children.push(c); return c; },
    append(...cs) { this.children.push(...cs); },
    insertBefore(c) { this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; },
    remove() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementsByTagName() { return []; },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return true; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 320, height: 120, right: 320, bottom: 120 }; },
    closest() { return null; },
    contains() { return false; },
    matches() { return false; },
    focus() {},
    blur() {},
    scrollTo() {},
    animate() { return { finished: Promise.resolve(), cancel() {}, onfinish: null }; },
    cloneNode() { return makeEl(tag); },
    get firstChild() { return this.children[0] ?? null; },
    get parentElement() { return null; },
  };
  return el;
}

function installDom() {
  const documentElement = makeEl('html');
  const head = makeEl('head');
  const body = makeEl('body');
  const doc = {
    documentElement, head, body,
    readyState: 'complete',
    createElement: (t) => makeEl(t),
    createElementNS: (_ns, t) => makeEl(t),
    createTextNode: (t) => ({ nodeValue: String(t) }),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener() {}, removeEventListener() {},
    visibilityState: 'visible',
    fonts: { addEventListener() {} },
  };
  const win = {
    document: doc,
    __ModuleLoader__: { load(reg) { (win.__regs ||= []).push(reg); } },
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    requestAnimationFrame: (cb) => setTimeout(() => cb(performance.now()), 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: {
      _m: new Map(),
      getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
      setItem(k, v) { this._m.set(k, String(v)); },
      removeItem(k) { this._m.delete(k); },
    },
    location: { href: 'http://127.0.0.1/', origin: 'http://127.0.0.1' },
    console,
    performance,
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    innerWidth: 1600, innerHeight: 1000, devicePixelRatio: 1,
  };
  globalThis.window = win;
  globalThis.document = doc;
  globalThis.localStorage = win.localStorage;
  globalThis.requestAnimationFrame = win.requestAnimationFrame;
  globalThis.cancelAnimationFrame = win.cancelAnimationFrame;
  globalThis.matchMedia = win.matchMedia;
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  globalThis.MutationObserver = class { observe() {} disconnect() {} takeRecords() { return []; } };
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  globalThis.getComputedStyle = win.getComputedStyle;
  globalThis.HTMLElement = class {};
  globalThis.SVGElement = class {};
  globalThis.Node = class {};
  globalThis.Event = class { constructor(t) { this.type = t; } };
  globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o || {}); } };
  globalThis.performance = performance;
  return win;
}

/* ------------------------------------------------------------- require stubs */
const jsx = (type, props, key) => ({ type, props, key });
const reactStub = {
  createElement: jsx, Fragment: 'Fragment', useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
  useEffect() {}, useLayoutEffect() {}, useMemo: (f) => f(), useCallback: (f) => f, useRef: (v) => ({ current: v }),
  useSyncExternalStore: (_sub, getSnapshot) => { try { return getSnapshot(); } catch { return undefined; } },
  forwardRef: (f) => f, memo: (f) => f, createContext: () => ({ Provider: 'Provider', Consumer: 'Consumer' }),
};
const jsxRuntime = { jsx, jsxs: jsx, Fragment: 'Fragment', createElement: jsx };
function makeRequire(custom = {}) {
  return (spec) => {
    if (custom[spec] !== undefined) return custom[spec];
    if (spec === 'react') return reactStub;
    if (spec === 'react/jsx-runtime' || spec === 'react/jsx-dev-runtime') return jsxRuntime;
    if (spec === '@deepseek-ai/dsh-client-ui-primitives') {
      return {
        Tooltip: 'Tooltip',
        IconPlayOutlineRegular: 'IconPlayOutlineRegular',
        IconStopFillRegular: 'IconStopFillRegular',
        IconPauseOutlineRegular: 'IconPauseOutlineRegular',
      };
    }
    throw new Error(`unexpected require("${spec}")`);
  };
}

/* ------------------------------------------------------------------ ctx stub */
function makeCtx(log) {
  const slots = {
    inject(name, fn) { log.push(`slots.inject ${name}`); const r = fn(); return r; },
    register(def, render) { log.push(`slots.register ${def && def.name}#${def && def.id}`); return () => {}; },
    entries() { return []; },
  };
  const sessions = {
    clear() { log.push('sessions.clear'); },
    list: { getSnapshot: () => ({ phase: 'ready', items: [{ workspaceId: 'w1', sessionIds: [] }], current: undefined }), subscribe: () => () => {} },
    binding() { return undefined; },
    getSnapshot: () => ({ phase: 'ready', items: [] }),
  };
  const workspaces = {
    startSession() { log.push('workspaces.startSession'); },
    list: { getSnapshot: () => ({ phase: 'ready', items: [{ workspaceId: 'w1', sessionIds: [] }] }), subscribe: () => () => {} },
  };
  const uiWorkspace = { startSession() { log.push('uiWorkspace.startSession'); } };
  const provided = new Map();
  const settingsScopeApi = {
    name: 'settingsScope', version: 1,
    bind({ namespace }) {
      log.push(`settingsScope.bind ${namespace}`);
      return {
        getSnapshot: () => ({ status: 'ready', namespace, value: {}, writable: true, source: 'memory' }),
        subscribe: () => () => {},
        set: () => true, update: () => true, unset: () => true, mutate: async () => true, refresh: () => {}, dispose: () => {},
      };
    },
    get: () => undefined,
  };
  provided.set('settingsScope', settingsScopeApi);
  const ctx = {
    slots, sessions, workspaces, uiWorkspace,
    settingsScope: settingsScopeApi,
    effect(fn) { log.push('effect'); const d = fn(); return typeof d === 'function' ? d : () => {}; },
    provide(name, value) { log.push(`provide ${name}`); provided.set(name, value); return () => {}; },
    get(name) { return provided.get(name); },
    inject(names, cb) {
      log.push(`inject ${names.join('+')}`);
      if (names.includes('remote')) {
        const remoteCtx = {
          remote: {
            settings: { describe: async () => ({ ok: true, value: { writable: true, namespaces: [] } }), mutate: async () => ({ ok: true }) },
            $on: () => () => {},
          },
          on: () => () => {},
          effect(fn) { log.push('remote.effect'); const d = fn(); return typeof d === 'function' ? d : () => {}; },
        };
        cb(remoteCtx);
      }
    },
    on() { return () => {}; },
    remote: { $on: () => () => {} },
    log,
    provided,
  };
  return ctx;
}

/* ------------------------------------------------------------------- runner */
function loadBundle(file) {
  const src = fs.readFileSync(file, 'utf8');
  const win = globalThis.window;
  win.__regs = [];
  // eslint-disable-next-line no-new-func
  const fn = new Function('window', 'document', 'localStorage', 'console', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'ResizeObserver', 'MutationObserver', src);
  fn(win, globalThis.document, globalThis.localStorage, console, performance, win.requestAnimationFrame, win.cancelAnimationFrame, setTimeout, clearTimeout, globalThis.ResizeObserver, globalThis.MutationObserver);
  const reg = win.__regs[0];
  if (!reg) throw new Error('bundle did not register with window.__ModuleLoader__');
  return reg;
}

const EXPECTATIONS = {
  'dsh-balance-meter': { file: 'node_modules/dsh-balance-meter/lib/client.js', mustLog: ['slots.inject sidebar.footer.action'] },
  'dsh-browser-dock': { file: 'node_modules/dsh-browser-dock/lib/client.js', mustLog: ['slots.inject shell.overlay'] },
  'dsh-fairy-startup': { file: 'node_modules/dsh-fairy-startup/lib/client.js', mustLog: ['sessions.clear'] },
  'dsh-fairy-voice': { file: 'node_modules/dsh-fairy-voice/lib/client.js', mustLog: ['slots.inject'] },
  'dsh-fairy-visual': { file: 'node_modules/dsh-fairy-visual/lib/client.js', mustLog: ['slots.register'] },
  'dsh-fairy-compat-settings-scope': { file: 'compat/dsh-fairy-compat-settings-scope/lib/client.js', mustLog: ['provide settingsScope'] },
  'dsh-fairy-compat-bg-eye': { file: 'compat/dsh-fairy-compat-bg-eye/lib/client.js', mustLog: [] },
};

installDom();
let failures = 0;
for (const [id, exp] of Object.entries(EXPECTATIONS)) {
  const file = path.join(tree, exp.file);
  if (!fs.existsSync(file)) { console.log(`FAIL ${id}: missing ${file}`); failures++; continue; }
  const log = [];
  try {
    installDom();
    const reg = loadBundle(file);
    const face = reg.factory(makeRequire());
    if (!face || typeof face.apply !== 'function') throw new Error('factory did not return { apply }');
    const ctx = makeCtx(log);
    face.apply(ctx);
    const missing = exp.mustLog.filter((m) => !log.some((l) => l.includes(m)));
    if (missing.length) throw new Error(`expected calls missing: ${missing.join(', ')}`);
    console.log(`ok   ${id}  calls=[${log.join(' | ')}]`);
  } catch (error) {
    console.log(`FAIL ${id}: ${error.message}`);
    failures++;
  }
}

// The startup port must actually prefer the 0.2.2 readiness/API path.
(function verifyStartupPort() {
  const log = [];
  try {
    installDom();
    const file = path.join(tree, 'node_modules/dsh-fairy-startup/lib/client.js');
    const reg = loadBundle(file);
    const face = reg.factory(makeRequire());
    face.apply(makeCtx(log));
    const ok = log.includes('sessions.clear') && (log.includes('workspaces.startSession') || log.includes('uiWorkspace.startSession'));
    console.log(`${ok ? 'ok  ' : 'FAIL'} startup-port  calls=[${log.join(' | ')}]`);
    if (!ok) failures++;
  } catch (error) {
    console.log('FAIL startup-port:', error.message);
    failures++;
  }
})();

// Backward compatibility: a 0.2.1-style snapshot (baselinesReady/recentWorkspaceId, no phase)
// must still drive the legacy workspaces.startSession() path.
(function verifyStartupLegacyPath() {
  const log = [];
  try {
    installDom();
    const reg = loadBundle(path.join(tree, 'node_modules/dsh-fairy-startup/lib/client.js'));
    const face = reg.factory(makeRequire());
    const ctx = makeCtx(log);
    ctx.workspaces = {
      startSession() { log.push('legacy.workspaces.startSession'); },
      list: { getSnapshot: () => ({ baselinesReady: true, recentWorkspaceId: 'w1' }), subscribe: () => () => {} },
    };
    face.apply(ctx);
    const ok = log.includes('sessions.clear') && log.includes('legacy.workspaces.startSession');
    console.log(`${ok ? 'ok  ' : 'FAIL'} startup-legacy-0.2.1  calls=[${log.join(' | ')}]`);
    if (!ok) failures++;
  } catch (error) {
    console.log('FAIL startup-legacy-0.2.1:', error.message);
    failures++;
  }
})();

console.log(failures ? `FAILURES=${failures}` : 'OK');
process.exit(failures ? 1 : 0);
