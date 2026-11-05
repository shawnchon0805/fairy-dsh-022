# Fairy DSH → DSH 0.2.2-rc.1 — Client API Archaeology & Port Plan

Status: **report only** — no source files were modified.
Author: delegated subagent (API archaeology), 2026-11-06.
Target host: **DSH 0.2.2-rc.1**. Installed host: 0.2.1-rc.5.

---

## 0. How to read this document

### Evidence shorthand

Paths are relative to the extracted tarballs unless absolute:

| Alias | File |
|---|---|
| `UP/` | `C:\Users\shawn\OneDrive\文档\deepseek-harness\default-workspace\fairy-dsh-install\upstream\0.2.2-rc.1\pkgs\` |
| `WS` | `UP/dsh-client-ui-workspace/lib/client.js` (6165 lines) |
| `WSD` | `UP/dsh-client-ui-workspace/lib/types/client/navigation.d.ts` (200 lines) |
| `WSS` | `UP/dsh-client-ui-workspace/lib/types/client/contract/slots.d.ts` (513 lines) |
| `WC` | `UP/dsh-api-workspace-controller/lib/client.js` (531 lines) |
| `SET` | `UP/dsh-client-ui-settings/lib/client.js` (1511 lines) |
| `SETS` | `UP/dsh-client-ui-settings/lib/types/client/contract/slots.d.ts` (205 lines) |
| `SLOT` | `UP/dsh-client-ui-slots/lib/types/index.d.ts` (955 lines) |
| `HOSTSET` | `UP/dsh-settings/lib/types/index.d.ts` (119 lines) |
| `FE` | `UP/dsh-web-frontend/dist/assets/index-BgUyXZcc.js` — **one minified line 194** carries the whole primitives export table *and* the web boot audit; line 2/10/196 carry the boot/cordis runtime |
| `PATCH` | `C:\Users\shawn\.dsh\profiles\desktop\cordis.patch.yml` |

Fairy sources:

| Alias | File |
|---|---|
| `START` | `C:\Users\shawn\.dsh\plugin-suite\fairy-dsh\node_modules\dsh-fairy-startup\lib\client.js` (123 lines) |
| `VOICE` | `...\node_modules\dsh-fairy-voice\lib\client.js` (1533 lines) |
| `VIS` | `...\node_modules\dsh-fairy-visual\lib\client.js` (7838 lines) |
| `SHIM` | `C:\Users\shawn\.dsh\plugin-suite\fairy-dsh\compat\dsh-fairy-compat-settings-scope\lib\client.js` (481 lines) |
| `VISHOST` | `...\node_modules\dsh-fairy-visual\lib\index.js` (42 lines) |

### Confidence vocabulary (used literally everywhere below)

- **PROVEN** — the 0.2.2 tarball contains the definition/call I cite; the mapping is direct.
- **INFERRED** — no direct call site, but 0.2.2 code demonstrably replaces the old idiom; high confidence, not certainty.
- **UNVERIFIED** — the owning 0.2.2 package is **not** in the extracted set, so I could not read it.
- **ASSUMED** — no evidence in either direction; an engineering guess.

### Packages I could **not** inspect (say this plainly, it bounds everything)

The extracted set is only: `dsh-settings`, `dsh-client-ui-settings`, `dsh-client-ui-workspace`, `dsh-api-workspace-controller`, `dsh-client-modules`, `dsh-client-ui-slots`, `dsh-web-frontend`, `dsh-web-app`, `dsh-base`.

Missing and load-bearing:

1. `@deepseek-ai/dsh-api-session-controller` — **the `sessions` service contract**. Both `WS:5` (`ISessions`) and `WS:5748` (`inject: ["sessions"]`, `ctx.get("sessions")` at 5764) prove it exists, but its snapshot/`binding()` shapes are unreadable here. `sessions.clear()`, `sessions.list.getSnapshot().current`, and `sessions.binding(id).session` are therefore **UNVERIFIED**.
2. `@deepseek-ai/dsh-client-ui-conversation` — owner of `conversation.*` slots and of the `useSession` hook. Declared in `UP/dsh-web-app/cordis.patch.yml:322-323` and `UP/dsh-client-ui-workspace/package.json:39,65`. The three conversation slot names used by the Fairy suite are **UNVERIFIED**.
3. `@deepseek-ai/dsh-client-ui-primitives` — not extracted as a package, but its **complete export table is inlined in `FE:194`** (`const FU=Object.freeze(...)`), so icon/tooltip existence is still **PROVEN** there.
4. `@deepseek-ai/dsh-client-ui-settings-general` — the runtime declarer of `settings.section`. The slot **type** is PROVEN in `SETS`; the shell that declares it is not extracted.
5. `@deepseek-ai/dsh-client-store` — the snapshot-store/persist implementation; used but not readable.

Consequence: every statement about the *session* object and the *conversation* slots is flagged, not asserted.

---

## 1. `dsh-fairy-startup`

### 1.1 What it does today

`START:63-93` builds a starter that waits for the workspace baseline and then calls a "start a fresh session" API; `START:95-112` clears the restored selection synchronously at apply time, then arms the starter; `START:114-121` wires it into `ctx.effect` with `inject: ['sessions','workspaces']`.

Complete inventory of host API surface used:

| # | Call | Line(s) |
|---|---|---|
| 1 | `ctx.sessions` (service) | 116, 121 |
| 2 | `ctx.workspaces` (service) | 116, 121 |
| 3 | `workspaces.list.getSnapshot()` | 67 |
| 4 | `snapshot.baselinesReady` | 68 |
| 5 | `snapshot.recentWorkspaceId` | 72 |
| 6 | `workspaces.startSession()` (no args) | 74 |
| 7 | `workspaces.list.subscribe(fn)` → unsubscribe | 87 |
| 8 | `sessions.clear()` | 103 |
| 9 | `ctx.effect(dispose, label)` | 117 |
| 10 | DOM: `data-dsh-fairy-startup-reset` on `document.documentElement` | 4, 96-98, 105 |

No other services, no `ctx.slots`, no `remote.*`.

### 1.2 Call-by-call mapping

| Current call (START) | 0.2.2 equivalent | Confidence | Evidence |
|---|---|---|---|
| `workspaces.list.getSnapshot()` | unchanged — `WorkspaceController.list` **is** the `ClientWorkspaceModel` | PROVEN | `WC:391` (`this.list = model`), snapshot builder `WC:259-267` |
| `snapshot.baselinesReady` | `workspaces.list.getSnapshot().phase === "ready"` **AND** `sessions.list.getSnapshot().phase === "ready"` | PROVEN | `WS:1510` uses exactly that pair for "both baselines ready"; `WS:1591` repeats it in `watchNavigation`. Workspace snapshot fields are `{items, archivedSessionIds, pinnedSessionIds, state, phase, error}` (`WC:259-267`) |
| `snapshot.recentWorkspaceId !== undefined` | `workspaces.list.getSnapshot().items.length > 0` (equivalently: let `startSession()` decide) | INFERRED | `recentWorkspace()` (`WS:1704-1719`) returns `undefined` **only** when the workspace array is empty; otherwise it always returns an id |
| `workspaces.startSession()` | `ctx.uiWorkspace.startSession()` (no args) | **PROVEN** | `WS:1502-1530`; service registered as `"uiWorkspace"` at `WS:1382`; `Context.uiWorkspace` augmentation `WSD:118-123`, signature `WSD:60` — **there is no `startSession` on the workspaces controller at all** (`WC:381-437`) |
| `workspaces.list.subscribe(fn)` | unchanged | PROVEN | `WC:245-250` (`subscribe`), `WC:391`; used by 0.2.2 itself at `WS:1605` |
| `sessions.clear()` | **no equivalent found** | UNVERIFIED | `dsh-api-session-controller` not extracted; zero `sessions.clear` / session-selection clear in any 0.2.2 package. Closest is the **private** `UiWorkspaceService.clearMain()` (`WS:1654-1660`), which also resets the private selection store persisted as `dsh.sessions.current` (`WS:1370`) |
| `ctx.effect(fn, label)` | unchanged | PROVEN | `WS:1397`, `WS:5785` |
| `inject: ['sessions','workspaces']` | `['sessions','workspaces','uiWorkspace']` (or optional inject, see risk R6) | PROVEN service exists | `WS:1382`, `WS:5745-5756` |

### 1.3 Where "start a new session / pick workspace" lives in 0.2.2

- **Service method (the replacement):** `uiWorkspace.startSession(workspaceId?, options?)` — `WS:1502`; typed `WSD:60`. Target resolution is `workspaceId ?? currentWorkspaceId ?? recent` (`WS:1506-1511`); when no target exists it calls `clearMain()` and returns (`WS:1512-1522`), i.e. it leaves the native New-Session view. It accepts `{ prompt, whenDraftExists, clearPreviousDraft, agentPreset }` (`WSD:11-15`, `WS:1503-1505`). It is fire-and-forget: internal failures are caught and only `console.warn`ed (`WS:1527-1529`).
- **Sibling entry points:** `uiWorkspace.openWorkspace(id, beforeOpen?, options?)` `WS:1476-1493`; `uiWorkspace.connectWorkspace(id, options?)` `WS:1399-1418`; `uiWorkspace.openSession(target)` `WS:1473-1475`.
- **Command:** `session.new` (`WS:134-139`) → `navigation.startSession()`; second arg is the workspace action set (`WSS:284-289`).
- **Workspace picking UI:** hero picker slot `conversation.hero.workspace` (`WS:6138-6146`) with child hole `conversation.hero.workspace.directoryFlow` (`WS:6140-6143`); sidebar hole `sidebar.workspaces.directoryFlow` (`WS:6053`, `WS:4050`); programmatic native picker `uiWorkspace.pickDirectory()` (`WS:1562-1566`).

### 1.4 Proposed replacement (concrete)

Replace `createWorkspaceStarter` (`START:63-93`) with:

```js
function createWorkspaceStarter(sessions, workspaces, uiWorkspace) {
  let unsubscribe = null;
  let started = false;
  const startWhenReady = () => {
    if (started) return false;
    const workspace = workspaces.list.getSnapshot();
    const sessionList = sessions.list.getSnapshot();
    // 0.2.2 readiness: both projections ready (WS:1510, WS:1591).
    if (workspace.phase !== 'ready' || sessionList.phase !== 'ready') return false;
    // Empty install: 0.2.2 ui-workspace's own restoreSelection creates the
    // default workspace + blank (WS:1630-1637). Do not race it.
    if (workspace.items.length === 0) { started = true; return true; }
    try {
      uiWorkspace.startSession(); // WS:1502 — picks current, then recent
    } catch (error) {
      diagnostics.error('session.start-fresh', error, {});
      return false;
    }
    started = true;
    unsubscribe?.();
    unsubscribe = null;
    return true;
  };
  return {
    startOrSubscribe() {
      if (startWhenReady()) return;
      const offWorkspaces = workspaces.list.subscribe(startWhenReady);
      const offSessions = sessions.list.subscribe(startWhenReady);
      unsubscribe = () => { offWorkspaces(); offSessions(); };
    },
    dispose() { unsubscribe?.(); },
  };
}
```

and in `resetStartupSelection` (`START:95-112`):

```js
if (typeof sessions.clear === 'function') {
  try { sessions.clear(); } catch (error) { /* unchanged */ }
}
const starter = createWorkspaceStarter(sessions, workspaces, uiWorkspace);
```

`apply` becomes `resetStartupSelection(ctx.sessions, ctx.workspaces, ctx.uiWorkspace)`; module export becomes `inject: ['sessions', 'workspaces', 'uiWorkspace']` (`START:121`). **Prefer the optional-inject variant in §6 A.1** if a missing `ui-workspace` should degrade rather than fail the boot audit (R6).

**Why the `items.length` gate:** the old code only started when `recentWorkspaceId` existed, which in 0.2.2 is exactly "the workspace list is non-empty". Without the gate, an empty install would create a second blank session after ui-workspace already created the default one.

### 1.5 Risks specific to fairy-startup

- **R3 (semantic):** `sessions.clear()` may not exist → the restored conversation can render for a frame before `startSession()` replaces it. The old "no flash" guarantee is weakened. Optional mitigation (ASSUMED): remove the persisted selection key `dsh.sessions.current` from `localStorage` before the baselines land — the key is proven (`WS:1370`) but the persistence backend is `dsh-client-store` (not extracted).
- Calling `startSession()` on every boot replaces the "restore last conversation" behaviour with "always a fresh blank". That is the plugin's intent, but it also means a session that was mid-draft is left behind (its blank is kept, not deleted).
- Double-blank risk if the gate is dropped.

---

## 2. `dsh-fairy-voice`

### 2.1 Exact icon / prop usage sites

| Site | Code | Notes |
|---|---|---|
| `VOICE:6` | `const { Tooltip, IconPauseOutline16, IconPlayOutline16, IconStopFill16 } = require('@deepseek-ai/dsh-client-ui-primitives')` | `IconPauseOutline16` is imported and **never used** — `VOICE:6` is its only occurrence in the file |
| `VOICE:1487` | `children: active ? jsx.jsx(IconStopFill16, { size: 16 }) : jsx.jsx(IconPlayOutline16, { size: 16 })` | inside `MessageAction`, the only icon render site |
| `VOICE:1431, 1433, 1485` | `jsx.jsx(Tooltip, { label: <string>, children: <button/input> })` | `label` only |

### 2.2 Drop-in replacements

| Old | 0.2.2 | Confidence | Evidence |
|---|---|---|---|
| `IconPlayOutline16` | `IconPlayOutlineRegular` | PROVEN (exists) / ASSUMED (visual parity) | export table `FE:194` contains `IconPlayOutlineRegular:<ident>`; no `IconPlayOutline16` in the naming scheme |
| `IconStopFill16` | `IconStopFillRegular` | PROVEN / ASSUMED | `FE:194` contains `IconStopFillRegular:<ident>` |
| `IconPauseOutline16` | `IconPauseOutlineRegular` — or delete the import (unused) | PROVEN / ASSUMED | `FE:194` contains `IconPauseOutlineRegular:<ident>` |
| `size: 16` prop | unchanged | PROVEN | 0.2.2 official code renders these icons with explicit `size`: `WS:2297` (14), `WS:2393` (14), `WS:2759` (16), `WS:3158` (24) |
| `Tooltip` + `{label}` | unchanged | PROVEN | `FE:194` exports `Tooltip`; 0.2.2 usage `WS:2281-2287` (`label`, plus optional `shortcutKeys`, `side`, `align`, `delayMs`, `portal`) — the Fairy subset is valid |

No signature, prop-shape, or sizing change is needed beyond the three identifiers. This is a **two-line edit**.

### 2.3 Other 0.2.2-specific findings for voice

| API used by VOICE | 0.2.2 status | Confidence | Evidence |
|---|---|---|---|
| `ctx.slots.inject(name, cb)` where `cb` registers and returns a disposer (`VOICE:1491-1507`) | supported; the callback may return a registration/disposer **or** be a generator | PROVEN | `WS:6080` (`() => ctx.slots.register(...)`), `WS:6138`, `WS:6050`; generator form `WS:6099-6114`, `WS:6115-6137` |
| `settings.section` slot (`VOICE:1525`) | still declared, `kind: "list"`, options `id/order/label`; `label` may be a **thunk** | PROVEN | `SETS:62-77` (slot), `SETS:73-76`, `SLOT:554-559` (`SlotLabel = string \| (() => string)`), `SLOT:568-573` |
| `inject: ['slots','sessions']` (`VOICE:1531`) | both services exist | PROVEN | `WS:5747-5748` |
| `sessions.list.subscribe` (`VOICE:392`) | exists | PROVEN | `WS:1606` |
| `sessions.list.getSnapshot().current` (`VOICE:384`) | **not observed anywhere in 0.2.2** | UNVERIFIED | 0.2.2 derives "current" from `retainedBy.mainView > 0`: `WS:100`, `WS:878`, `WS:3173`, `WS:3514`, `WS:3615`, `WS:3697`. `dsh-api-session-controller` missing from the set |
| slot props `{ useSession, sessionId }` (`VOICE:1008-1012`, `1466-1468`) | unreadable | UNVERIFIED | `conversation.*` slots belong to `dsh-client-ui-conversation` (not extracted). 0.2.2 slot standard props are hooks (`GlobalStandardProps`, `WSD`-adjacent `UP/dsh-client-ui-workspace/lib/types/client/index.d.ts:9-15`), and workspace rows receive `useSessions`/`useSessionStatus` (`WS:3663`) — so a hook family exists, but `useSession` itself is not provable here |
| `snapshot.chat.{order,nodes,timeline,legacy}` (`VOICE:455-524`) | unreadable | UNVERIFIED | conversation projection internals; owner package missing |
| `conversation.input.left`, `conversation.chat.assistant-actions` (`VOICE:1523-1524`) | **not found** in any extracted 0.2.2 package | UNVERIFIED | a repository-wide grep of `UP/` for those two literals returns zero hits (the only `conversation.*` slot names 0.2.2 declares here are `conversation.hero.workspace` / `.directoryFlow` at `WS:6138-6146`); owner is `dsh-client-ui-conversation` |

**Failure mode if a conversation slot name changed:** `ctx.slots.inject` waits for the declaration and the registration never happens — the control silently never renders. It does **not** throw and does **not** contribute to the boot audit (the audit counts plugin activation, not slot occupancy).

**Voice verdict:** the icon fix is proven and trivial; the plugin's data path (`useSession` + `chat.timeline`) and its two conversation slots are the real unknowns and need the `dsh-client-ui-conversation` tarball.

---

## 3. `dsh-fairy-visual`

### 3.1 Every `ctx.*` service it injects/uses

Declared inject list (`VIS:7822-7830`): `["slots", "sessions", "settingsScope"]`.

| Service | Use site | 0.2.2 status | Confidence | Evidence |
|---|---|---|---|---|
| `slots` | `ctx.slots.inject` ×4 (`VIS:7796-7819`) | exists | PROVEN | `WS:5747`, `WS:6080`, `WS:6138` |
| `sessions` | passed to `Controller` (`VIS:7793`) | exists | PROVEN | `WS:5748`, `WS:5764` |
| `settingsScope` | `ctx.settingsScope.bind({namespace})` ×2 (`VIS:7783-7784`) | **does not exist**; supplied by the shim | Known fact + `SHIM` | see §4 |
| `ctx.effect` | `VIS:7792`, `VIS:7795` | exists | PROVEN | `WS:1397`, `WS:5785` |
| `ctx.sessions.list.subscribe` | `VIS:6888` | exists | PROVEN | `WS:1606` |
| `ctx.sessions.list.getSnapshot().current` | `VIS:6913` | **not observed** | UNVERIFIED | same evidence as §2.3 |
| `ctx.sessions.binding(id)?.session` | `VIS:6914` | `binding()` exists; `.session` unreadable | PARTIAL — `binding` PROVEN (`WS:1524`), `.session` UNVERIFIED | `WS:1524-1526` passes the binding object to `requestDraftInitialization` instead |
| `session.subscribe` / `session.getSnapshot()` / `session.sessionId` | `VIS:6918-6928` | unreadable | UNVERIFIED | the session handle contract lives in the missing package |

Closest official "scoped settings" service in 0.2.2 (for reference, not a drop-in): `ctx.configForms.get(entryId)` → `ConfigFormController` with `getSnapshot/subscribe/set/unset/mutate` (`SET:1294-1299`, class `SET:1080-1244`). It only serves namespaces that are real settings entries — otherwise `status: "unavailable"` (`SET:1215-1218`) — so it is not a general replacement for `settingsScope`.

### 3.2 Every slot it registers

| Slot | id / order | Exists in 0.2.2? | Confidence | Evidence |
|---|---|---|---|---|
| `shell.overlay` | `dsh-fairy-visual-stage` / 10 (`VIS:7796-7800`) | **yes** | PROVEN by use | `WS:6115-6137` registers three `shell.overlay` entries; its contract types the slot (`WSS:488-495`) |
| `conversation.session.header.utilities` | `dsh-fairy-session-metrics` / 80 (`VIS:7801-7805`) | **not found** in the extracted set | UNVERIFIED | owner `dsh-client-ui-conversation` missing; Fairy's own DOM selectors (`VIS:646`) are not evidence |
| `conversation.session.header.utilities` | `dsh-fairy-visual-toggle` / 90 (`VIS:7806-7810`) | same | UNVERIFIED | same |
| `settings.section` | `dsh-fairy-visual` / 45, `label: () => "HDD 视觉与 Fairy 身份"` (`VIS:7811-7819`) | **yes** | PROVEN | `SETS:62-77`; thunk label legal (`SLOT:554-559`, `SLOT:568-573`) |

Registration mechanics are compatible: list slots require `id` (`SLOT:568-573`), duplicate `id`+`priority` throws (`UP/dsh-client-ui-slots/lib/index.js:171-183`), and the Fairy ids are distinct per slot. `order` semantics are unchanged.

### 3.3 The `Controller` session-binding chain — the single biggest client risk

`VIS:6912-6923`:

```js
const id = this.sessions.list.getSnapshot().current;
const next = id == null ? null : this.sessions.binding(id)?.session || null;
...
this.sessionOff = next?.subscribe(() => this.update()) || null;
```

and `VIS:6924-6932` reads `this.session.getSnapshot()` (`running`, `blank`, `chat…` via `deriveSessionComfort` `VIS:277-288`) and `this.session.sessionId`.

In 0.2.2 every official "current session" derivation goes through **retention**, not a snapshot field:

- `mainSessionId(list)` = first `byId` row with `(retainedBy.mainView ?? 0) > 0` — `WS:877-879`
- same idiom at `WS:100`, `WS:3173`, `WS:3514`, `WS:3615`, `WS:3697`
- selection itself is a private persisted store `dsh.sessions.current` (`WS:1370`) plus `mainReference` (`WS:1371`), not a public field.

So the adapter below is the minimal safe port; it keeps working if `.current` survives and falls back to retention if it does not:

```js
function readCurrentSessionId(sessions) {
  const list = sessions.list.getSnapshot();
  if (typeof list.current === 'string') return list.current;            // 0.2.1 path
  const row = Object.values(list.byId || {})
    .find((session) => (session.retainedBy?.mainView ?? 0) > 0);        // WS:878 idiom
  return row?.id;
}
```

If `binding(id)?.session` is also gone, the fallback is a **design change**, not a rename: move the live-session subscription into a React slot component (the plugin already registers `StageHost` as a slot component, `VIS:7800`) and push snapshots into the Controller (`controller.setSessionSnapshot(sessionId, snap)`), keeping the Controller React-free. That requires the conversation/session hook contract from `dsh-client-ui-conversation` + `dsh-api-session-controller`.

### 3.4 Host-half prerequisite (outside the four items, but blocking)

`VISHOST:1` imports `settingsNamespace` from `@deepseek-ai/dsh-settings`, and `VISHOST:11-12,37-40` calls `settingsCtx.settings.register(ns, schema)`. In 0.2.2:

- `dsh-settings` exports `SettingsForms` with **no** `register`, and no `settingsNamespace` (`HOSTSET:1-6` export list; methods `configure/describe/update/replace/mutate` at `HOSTSET:80-114`). Namespaces are now **profile entry ids** (`HOSTSET:96-114`).
- The profile loads the host half as entry `fairy-visual` with `inject: [clientModules]` (`PATCH:104-106`) — an ESM link error there means the client bundle is never registered, so the visual plugin disappears entirely, not just its settings.

Fix the host half before spending time on the client adapter.

---

## 4. `settingsScope` shim (`dsh-fairy-compat-settings-scope`)

### 4.1 Call-by-call verification against 0.2.2

| Shim call | 0.2.2 counterpart | Verdict | Evidence |
|---|---|---|---|
| `face.describe()` → `{ok, value:{writable, namespaces:[view]}}` (`SHIM:177-185`) | `await ctx.remote.settings.describe()`; `response.ok ? {view: response.value}` (`SET:1447-1448`), document `writable` read at `SET:1213` | **MATCHES** | `SET:1447-1448`, `SET:1213`, `SET:1413-1425` |
| `face.mutate(ns, ops, revision)` (`SHIM:205`) | `this.ctx.remote.settings.mutate(this.spec.namespace, ownedOps, revision)` (`SET:1170`) | **MATCHES** (same arity/order) | `SET:1170` |
| ops `[{op:'set'|'unset', path:[field], value}]` (`SHIM:345,357,380-393`) | identical shapes produced by `ConfigFormController.set/unset` (`SET:1140-1158`) | **MATCHES** | `SET:1141-1157` |
| namespace view fields `ns, revision, base, user, value, schema` (`SHIM:151-154, 203, 224-226, 252-263`) | same fields consumed at `SET:1214, 1224-1226, 1234, 1238` | **MATCHES** | `SET:1214-1243` |
| document-level `writable` (`SHIM:253`) | `mirrored.view.writable` (`SET:1213`) | **MATCHES** | `SET:1213` |
| `ctx.inject(['remote','remote.settings'], cb)` (`SHIM:446`) | both services exist; `ctx.inject(services, cb)` is live in 0.2.2 | **MATCHES** | `SET:1481` (`inject = ["remote","remote.settings"]`), `FE:196` (`e.inject(["uiRenderer"], r => …)`) |
| `ctx.provide('settingsScope', api)` (`SHIM:436-441`) | cordis `provide` still exists | **ASSUMED OK** | not directly readable in the extracted packages; no counter-evidence |

**Verdict: the shim still loads and its transport contract is unchanged.** No signature edits are required for `describe`/`mutate`.

### 4.2 Two behavioural gaps that make it *work but not persist*

**(a) No invalidation subscription.** 0.2.2 refreshes its mirror on `remote.$on("settings/document-updated")` and `on("connection/reset")` (`SET:1488-1498`). The shim only reloads on a local write. Its snapshots go stale after an external change (another window, a Host-side edit, a reconnect).

Suggested insertion after `attachEngine(...)` at `SHIM:458`:

```js
remoteCtx.effect(() => () => remoteCtx.remote.$on('settings/document-updated', () => {
  if (engine !== undefined) void engine.load();
}), `${NAME}.follow.invalidation`);
```

**(b) The namespace registration mechanism it targets no longer exists.** In 0.2.2 the Host `SettingsForms` has no `register(ns, schema)`; `describe()` returns live **profile entries** keyed by entry id (`HOSTSET:96-114`). The Fairy host half registered `fairy-visual` / `fairy-identity` explicitly (`VISHOST:37-40`), and it cannot even load (see §3.4). Therefore:

- `fairy-identity` has **no** matching profile entry → `engine.row("fairy-identity")` is always `undefined` → the shim serves the **memory** snapshot (`SHIM:250-266`) → the identity settings reset on every reload. Not a crash; silent data loss.
- `fairy-visual` **coincidentally equals the profile entry id** (`PATCH:104`), so `describe()` *may* return a row for it — but only if that entry exposes a config schema/value containing `enabled/theme/mascotVisible/...`. The current host half exports no `Config`, so this is **UNPROVEN**. If it does resolve, writes would go through `mutate` with the entry's schema; if the Host rejects unknown fields, `mutate` returns `ok:false`, the shim warns, reloads, returns `false` (`SHIM:200-219`) → UI still renders (memory store was already live? **no** — `live()` is true once a row exists, so a rejected write keeps the old value and the UI toggle snaps back).

**Exact adjustments if the shim is kept as-is (no persistence requirement):** only (a).
**If persistence is required:** add a `localStorage` write-through for the memory path (`setMemoryValues`, `SHIM:125-128`, plus hydration in `bind`, `SHIM:409-418`), or bind to the discovered entry id, or migrate the preference to `ctx.configForms.get(<entryId>)` which is the supported 0.2.2 path (`SET:1294-1299`).

**Do not** change `mutate` to omit `revision`: 0.2.2 sends the revision (`SET:1169-1170`) and the Host enforces it (`SettingsConflictError`, `HOSTSET:30-44`).

---

## 5. Risk register (ranked)

| # | Risk | Severity | Status | Mitigation |
|---|---|---|---|---|
| R1 | `dsh-fairy-visual/lib/index.js` cannot import `settingsNamespace` (not exported) and calls removed `settings.register` → host entry fails; profile entry carries `clientModules`, so the **client bundle may never register** | **Blocker** | PROVEN (host API) / INFERRED (client never loads) | Fix the host half first: drop `settingsNamespace`; declare the schema as the entry's `Config` or use `ctx.settings.configure({auto})` (`HOSTSET:80-82`) |
| R2 | `sessions.list.getSnapshot().current` may be gone; `binding(id).session` may be gone | High | UNVERIFIED | Adapter in §3.3; if it fails, move session subscription into a slot component |
| R3 | `sessions.clear()` may be gone → restore flash / different startup semantics | Medium | UNVERIFIED | Feature-detect + accept; optional `dsh.sessions.current` removal (ASSUMED) |
| R4 | `conversation.input.left`, `conversation.chat.assistant-actions`, `conversation.session.header.utilities` unverified | Medium | UNVERIFIED | Fetch/extract `@deepseek-ai/dsh-client-ui-conversation@0.2.2-rc.1` before editing; failure mode is silent (no crash) |
| R5 | Settings persistence lost (shim memory fallback for `fairy-identity`, possibly for `fairy-visual`) | Medium | INFERRED | localStorage write-through or `configForms` migration |
| R6 | Boot audit throws `web boot: N entries did not activate` for pending entries (`FE:194`) — adding a hard `uiWorkspace` inject can turn a missing service into a **boot failure**, not a degraded plugin | High | PROVEN (message present in bundle) | Prefer optional `ctx.inject(['uiWorkspace'], cb)` inside `apply` over adding it to the module `inject` array |
| R7 | `useSession` / `sessionId` slot props may have been replaced by a different hook set | High (voice) | UNVERIFIED | Needs the conversation package; fallback is to build the timeline from `sessions` directly |
| R8 | Fairy `dsh.client.inject` manifest edges are informational only — they do **not** order activation | Low | PROVEN | `WS:5739-5743`; do not expect manifest edits to fix ordering |
| R9 | `IconPauseOutline16` deletion must be complete (only `VOICE:6`) | Trivial | PROVEN | grep-verified single occurrence |

---

## 6. Concrete edit list (implementable without re-deriving)

All edits are in the **client bundles**; nothing else changes.

### A. `node_modules/dsh-fairy-startup/lib/client.js`

1. `START:121` — `inject` becomes `['sessions', 'workspaces']` and `apply` obtains `uiWorkspace` optionally:
   ```js
   function apply(ctx) {
     return diagnostics.guard('apply', () => {
       let disposeReset;
       ctx.inject(['uiWorkspace'], (uiCtx) => {
         disposeReset = resetStartupSelection(ctx.sessions, ctx.workspaces, uiCtx.uiWorkspace);
         if (disposeReset) ctx.effect(() => disposeReset, 'dsh-fairy-startup reset selection');
       });
     }, { surface: 'client' });
   }
   ```
   (Keeps the plugin activatable when `ui-workspace` is disabled — see R6.)
2. Replace `createWorkspaceStarter` (`START:63-93`) with the version in §1.4.
3. `START:109-110` — pass `uiWorkspace`.
4. `START:102-108` — guard `sessions.clear()` with `typeof sessions.clear === 'function'`.
5. Leave the attribute logic (`START:4,96-98,105`) untouched.

### B. `node_modules/dsh-fairy-voice/lib/client.js`

6. `VOICE:6` — change the destructured names to `IconPauseOutlineRegular, IconPlayOutlineRegular, IconStopFillRegular` (or drop `IconPauseOutlineRegular`).
7. `VOICE:1487` — `IconStopFill16` → `IconStopFillRegular`, `IconPlayOutline16` → `IconPlayOutlineRegular`. Keep `{ size: 16 }`.
8. Nothing else. Optionally add a one-line guard in `createActiveSessionStore` (`VOICE:382-398`) for `.current` (see §3.3 helper) so a missing field does not collapse every session to `'empty-chat'`.

### C. `node_modules/dsh-fairy-visual/lib/client.js`

9. Add `readCurrentSessionId` (§3.3) near the `Controller` class and replace `VIS:6913`.
10. Keep `VIS:6914` but treat `binding` as optional (`?.session`) — already optional-chained; add a `null` guard for `next` before `next?.subscribe` (safe today).
11. If `binding().session` is missing at runtime, add `Controller.prototype.setSessionSnapshot(sessionId, snapshot)` and a React bridge in the `StageHost` registration (`VIS:7800`) that calls it from the conversation hook. Do **not** rewrite the Controller.
12. No slot or service changes; `settingsScope` stays (shim).

### D. `compat/dsh-fairy-compat-settings-scope/lib/client.js`

13. Add the invalidation subscription (§4.2 a) after `SHIM:458`.
14. Optional: localStorage write-through in `setMemoryValues` / hydration in `bind` (§4.2 b).

### E. Do **not** edit

- `package.json` `dsh.client.inject` lists — informational only (R8).
- The four icon `size` values — `size` is honored (PROVEN).
- `label: () => ...` thunks — still legal (`SLOT:554-559`).

---

## 7. Proven vs assumed — one paragraph each

**Proven (read in 0.2.2 code):** the `workspaces` service/snapshot shape and the absence of `startSession`; `uiWorkspace.startSession` and its target-resolution/clear semantics; the two-phase readiness idiom (`workspace.phase === "ready" && sessions.phase === "ready"`); `list.subscribe` on both controllers; `ctx.effect`; the `slots.inject/register` API including returning disposers and generator callbacks; `settings.section` + `SlotLabel` thunk; `shell.overlay` existence; the primitives `Regular` icon names, `Tooltip`, and the `size` prop; the shim's `describe`/`mutate` wire contract; the 0.2.2 settings-host API (no `register`, entry-id namespaces); the boot-audit message.

**Inferred (strong indirect):** `recentWorkspaceId` ⇔ non-empty `items`; `.current` being replaced by `retainedBy.mainView`; the `fairy-visual` namespace coinciding with the profile entry id; host-half failure preventing client registration.

**Unverified (package missing):** everything about `sessions.clear`, `sessions.binding(...).session`, the live session handle (`subscribe/getSnapshot/sessionId`), `useSession`/`sessionId` slot props, the chat timeline shape, and the three `conversation.*` slot names.

**Assumed:** localStorage key `dsh.sessions.current` is readable/removable by plugins; `ctx.provide` semantics unchanged; `Regular` icons are visually interchangeable with the old `16` icons.

---

## 8. If a second agent needs to close the remaining unknowns

Only two tarballs are missing, and both are listed as real packages of the same version:

- `@deepseek-ai/dsh-api-session-controller@0.2.2-rc.1` → resolves `sessions.clear`, `list.getSnapshot().current`, `binding().session`, and the live session handle.
- `@deepseek-ai/dsh-client-ui-conversation@0.2.2-rc.1` → resolves `conversation.input.left`, `conversation.chat.assistant-actions`, `conversation.session.header.utilities`, and the `useSession` hook/props contract.

Until those are extracted, treat §3.3 and §2.3 as the only uncertain edits, and implement A/B/D first (they are fully evidenced).

---

## 9. Quick post-port verification checklist

1. Console: no `web boot: N entries did not activate` (`FE:194`); `dsh-fairy-*` entries show as active.
2. Console: no `[dsh-fairy-compat-settings-scope] settings.describe unavailable` warning for `fairy-visual` (would mean memory fallback).
3. Startup: a fresh blank session is selected on boot, and the sidebar shows the new row; on an empty profile exactly **one** blank is created (R1 gate).
4. Voice: the message action renders a play triangle (`IconPlayOutlineRegular`) and, while playing, a stop square (`IconStopFillRegular`), both 16 px.
5. Visual: the settings section appears under Settings with its label text (not `() => …`), and toggling HDD flips `html[data-dsh-fairy-visual]`.
