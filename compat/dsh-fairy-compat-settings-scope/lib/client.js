/**
 * dsh-fairy-compat-settings-scope — client half.
 *
 * WHY THIS EXISTS
 * The Fairy DSH suite (notably `dsh-fairy-visual`) declares
 *   inject: ["slots", "sessions", "settingsScope"]
 * and calls `ctx.settingsScope.bind({ namespace })` to obtain a small
 * snapshot-store controller: `{ getSnapshot, subscribe, set, update }`.
 * `settingsScope` is an EAC-fork-only client service; it does not exist anywhere
 * in DSH 0.2.1-rc.5 (0 occurrences across the shell bundle and every official
 * client bundle). Without it `dsh-fairy-visual` simply stays pending forever and
 * contributes nothing, so this plugin re-provides the missing service name.
 *
 * BACKING
 * 1. Real settings (preferred): the 0.2.1 client exposes the Host settings
 *    document through the `remote.settings` remote face —
 *      `face.describe()` -> { ok: true, value: { writable, namespaces: [view] } }
 *      `view` = { ns, revision, base, user, value, schema }
 *      `face.mutate(ns, ops, revision)` -> { ok, value: <that namespace view> }
 *    `remote.settings` is an optional dependency: this plugin never declares it
 *    in its module `inject`, because a missing dependency would leave the shim
 *    pending and re-break `dsh-fairy-visual`. It is followed lazily through
 *    `ctx.inject(["remote", "remote.settings"], ...)` instead.
 * 2. In-memory fallback: when the Host does not serve settings at all (for
 *    example `@deepseek-ai/dsh-client-ui-settings` disabled in the profile), every
 *    namespace still yields a ready snapshot over a local object store, so the
 *    Fairy UI renders and its writes succeed for the lifetime of the page.
 *
 * CONTRACT (matches the old fork closely enough for dsh-fairy-visual)
 *   snapshot = { status: "ready", namespace, value, base, user, revision,
 *                writable, source: "settings" | "memory" }
 *   getSnapshot()   stable reference until something changes (useSyncExternalStore)
 *   subscribe(fn)   -> disposer
 *   set(field, v)   -> Promise<boolean>
 *   unset(field)    -> Promise<boolean>
 *   update(patch)   -> Promise<boolean>   (parity with the fork; unused by the suite)
 *   mutate(ops)     -> Promise<boolean>   (`[{ op: "set"|"unset", path, value }]`)
 *
 * Plain JS, no build step, no `require()` calls: the module must materialize even
 * on a Host where none of the optional services exist.
 */
window.__ModuleLoader__.load({
  id: 'dsh-fairy-compat-settings-scope',
  factory: () => {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    const NAME = 'dsh-fairy-compat-settings-scope';
    const SERVICE = 'settingsScope';

    /* ------------------------------------------------------------------ */
    /* logging                                                            */
    /* ------------------------------------------------------------------ */

    const warned = new Set();

    function warn(message, error) {
      if (warned.has(message)) return;
      warned.add(message);
      try {
        // eslint-disable-next-line no-console
        console.warn(`[${NAME}] ${message}`, error === undefined ? '' : error);
      } catch {
        /* a Host without console must not break the plugin */
      }
    }

    /* ------------------------------------------------------------------ */
    /* helpers                                                            */
    /* ------------------------------------------------------------------ */

    function isObject(value) {
      return value !== null && typeof value === 'object';
    }

    function normalizeNamespace(spec) {
      if (typeof spec === 'string' && spec.length > 0) return spec;
      if (isObject(spec)) {
        for (const key of ['namespace', 'ns', 'id', 'scope']) {
          const candidate = spec[key];
          if (typeof candidate === 'string' && candidate.length > 0) return candidate;
        }
      }
      return 'default';
    }

    function sameSnapshot(a, b) {
      if (a === b) return true;
      return (
        a.status === b.status &&
        a.value === b.value &&
        a.revision === b.revision &&
        a.writable === b.writable &&
        a.source === b.source &&
        a.base === b.base &&
        a.user === b.user
      );
    }

    /* ------------------------------------------------------------------ */
    /* in-memory fallback store (one snapshot object per namespace)        */
    /* ------------------------------------------------------------------ */

    const memories = new Map();

    function memorySnapshot(namespace) {
      let snapshot = memories.get(namespace);
      if (snapshot === undefined) {
        snapshot = {
          status: 'ready',
          namespace,
          value: {},
          base: undefined,
          user: undefined,
          revision: undefined,
          writable: true, // local writes are allowed so the UI stays interactive
          source: 'memory',
        };
        memories.set(namespace, snapshot);
      }
      return snapshot;
    }

    function setMemoryValues(namespace, nextValues) {
      const before = memorySnapshot(namespace);
      memories.set(namespace, { ...before, value: nextValues, writable: true });
    }

    /* ------------------------------------------------------------------ */
    /* remote engine: mirror of the Host settings document                */
    /* ------------------------------------------------------------------ */

    function createEngine(face) {
      const listeners = new Set();
      let document; // { writable, namespaces: [view] }
      let inflight;
      let rerun = false;
      let closed = false;

      function emit() {
        for (const listener of [...listeners]) {
          try {
            listener();
          } catch (error) {
            warn('settings subscriber failed', error);
          }
        }
      }

      function row(namespace) {
        if (!isObject(document) || !Array.isArray(document.namespaces)) return undefined;
        return document.namespaces.find((candidate) => isObject(candidate) && candidate.ns === namespace);
      }

      function fold(view) {
        if (!isObject(view) || typeof view.ns !== 'string') return false;
        if (!isObject(document) || !Array.isArray(document.namespaces)) {
          document = { writable: true, namespaces: [view] };
          return true;
        }
        const namespaces = document.namespaces.some((candidate) => isObject(candidate) && candidate.ns === view.ns)
          ? document.namespaces.map((candidate) => (isObject(candidate) && candidate.ns === view.ns ? view : candidate))
          : [...document.namespaces, view];
        document = { ...document, namespaces };
        return true;
      }

      async function load() {
        if (closed) return;
        if (inflight !== undefined) {
          rerun = true;
          return inflight;
        }
        inflight = (async () => {
          try {
            const response = await face.describe();
            if (isObject(response) && response.ok === false) {
              throw new Error((isObject(response.error) && response.error.message) || 'settings.describe failed');
            }
            const view = isObject(response) ? response.value : undefined;
            if (isObject(view) && Array.isArray(view.namespaces)) {
              document = view;
              emit();
            }
          } catch (error) {
            // The Host may serve no settings at all: keep the memory fallback, retry later.
            warn('settings.describe unavailable; using in-memory settings', error);
          } finally {
            inflight = undefined;
            if (rerun) {
              rerun = false;
              void load();
            }
          }
        })();
        return inflight;
      }

      async function mutate(namespace, ops) {
        if (!isObject(document)) await load();
        const current = row(namespace);
        const revision = current === undefined ? undefined : current.revision;
        try {
          const response = await face.mutate(namespace, ops, revision);
          if (!isObject(response)) return false;
          if (response.ok === false) {
            warn(`settings write rejected for "${namespace}"`, response.error);
            await load();
            return false;
          }
          if (!fold(response.value)) await load();
          else emit();
          return true;
        } catch (error) {
          warn(`settings write failed for "${namespace}"`, error);
          return false;
        }
      }

      return {
        row,
        load,
        mutate,
        get document() {
          return document;
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        dispose() {
          closed = true;
          listeners.clear();
        },
      };
    }

    /* ------------------------------------------------------------------ */
    /* engine lifecycle                                                    */
    /* ------------------------------------------------------------------ */

    let engine; // current engine, or undefined while only memory is available
    let engineSubscription;

    const stores = new Map();

    function currentSnapshot(namespace) {
      const row = engine === undefined ? undefined : engine.row(namespace);
      if (row !== undefined) {
        const writable = !(isObject(engine.document) && engine.document.writable === false);
        return {
          status: 'ready',
          namespace,
          value: isObject(row.value) ? row.value : {},
          base: row.base,
          user: row.user,
          revision: row.revision,
          writable,
          source: 'settings',
        };
      }
      return memorySnapshot(namespace);
    }

    function attachEngine(next) {
      if (engine === next) return;
      detachEngine();
      engine = next;
      engineSubscription = next.subscribe(() => {
        for (const store of stores.values()) store.refresh();
      });
      for (const store of stores.values()) store.refresh();
      void next.load();
    }

    function detachEngine() {
      if (typeof engineSubscription === 'function') {
        try {
          engineSubscription();
        } catch {
          /* already gone */
        }
      }
      engineSubscription = undefined;
      if (engine !== undefined) {
        try {
          engine.dispose();
        } catch {
          /* already gone */
        }
      }
      engine = undefined;
      for (const store of stores.values()) store.refresh();
    }

    /* ------------------------------------------------------------------ */
    /* per-namespace store                                                 */
    /* ------------------------------------------------------------------ */

    function createStore(namespace) {
      const listeners = new Set();
      let snapshot = currentSnapshot(namespace);

      function notify() {
        for (const listener of [...listeners]) {
          try {
            listener();
          } catch (error) {
            warn(`settings listener failed for "${namespace}"`, error);
          }
        }
      }

      function refresh() {
        const next = currentSnapshot(namespace);
        if (sameSnapshot(next, snapshot)) return;
        snapshot = next;
        notify();
      }

      function live() {
        return engine !== undefined && engine.row(namespace) !== undefined;
      }

      const store = {
        namespace,

        getSnapshot() {
          return snapshot;
        },

        subscribe(listener) {
          listeners.add(listener);
          if (engine !== undefined && !isObject(engine.document)) void engine.load();
          return () => {
            listeners.delete(listener);
          };
        },

        async set(field, value) {
          if (live()) {
            const ok = await engine.mutate(namespace, [{ op: 'set', path: [field], value }]);
            refresh();
            return ok;
          }
          const before = memorySnapshot(namespace);
          setMemoryValues(namespace, { ...before.value, [field]: value });
          refresh();
          return true;
        },

        async unset(field) {
          if (live()) {
            const ok = await engine.mutate(namespace, [{ op: 'unset', path: [field] }]);
            refresh();
            return ok;
          }
          const before = memorySnapshot(namespace);
          const value = { ...before.value };
          delete value[field];
          setMemoryValues(namespace, value);
          refresh();
          return true;
        },

        async update(patch) {
          if (!isObject(patch)) return false;
          let ok = true;
          for (const [field, value] of Object.entries(patch)) {
            // Keep the same field-by-field order the old controller used.
            // eslint-disable-next-line no-await-in-loop
            ok = (await store.set(field, value)) && ok;
          }
          return ok;
        },

        async mutate(ops) {
          if (!Array.isArray(ops)) return false;
          if (live()) {
            const ok = await engine.mutate(namespace, ops);
            refresh();
            return ok;
          }
          const value = { ...memorySnapshot(namespace).value };
          for (const op of ops) {
            if (!isObject(op) || !Array.isArray(op.path) || op.path.length === 0) continue;
            const field = op.path[0];
            if (op.op === 'unset') delete value[field];
            else value[field] = op.value;
          }
          setMemoryValues(namespace, value);
          refresh();
          return true;
        },

        refresh,

        dispose() {
          listeners.clear();
        },
      };

      return store;
    }

    function bind(spec) {
      const namespace = normalizeNamespace(spec);
      let store = stores.get(namespace);
      if (store === undefined) {
        store = createStore(namespace);
        stores.set(namespace, store);
      }
      if (engine !== undefined && !isObject(engine.document)) void engine.load();
      return store;
    }

    /* ------------------------------------------------------------------ */
    /* plugin                                                              */
    /* ------------------------------------------------------------------ */

    function apply(ctx) {
      const api = {
        name: NAME,
        version: 1,
        /** The one call the Fairy suite makes: `settingsScope.bind({ namespace })`. */
        bind,
        /** Convenience alias for other consumers. */
        get(namespace) {
          return bind({ namespace });
        },
      };

      try {
        ctx.provide(SERVICE, api);
      } catch (error) {
        warn(`could not provide "${SERVICE}" (already registered?)`, error);
        return;
      }

      // Optional: follow the real settings remote face. `ctx.inject` only runs the
      // callback once the services exist, so its absence never blocks this plugin.
      try {
        ctx.inject(['remote', 'remote.settings'], (remoteCtx) => {
          let face;
          try {
            face = remoteCtx.remote === undefined || remoteCtx.remote === null ? undefined : remoteCtx.remote.settings;
          } catch (error) {
            warn('settings remote face is not accessible', error);
            return;
          }
          if (!isObject(face) || typeof face.describe !== 'function' || typeof face.mutate !== 'function') {
            warn('settings remote face is incomplete; using in-memory settings');
            return;
          }
          attachEngine(createEngine(face)); /* DSH_FAIRY_022_PATCH */
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
          }
          remoteCtx.effect(
            () => () => detachEngine(),
            `${NAME}.follow`,
          );
        });
      } catch (error) {
        warn('could not follow the settings remote face; using in-memory settings', error);
      }

      return () => {
        detachEngine();
        for (const store of stores.values()) store.dispose();
        stores.clear();
      };
    }

    exports.name = NAME;
    exports.inject = [];
    exports.apply = apply;
    exports.SERVICE = SERVICE;
    return module.exports;
  },
});
