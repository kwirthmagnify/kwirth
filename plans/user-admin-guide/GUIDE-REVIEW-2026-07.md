# Guide review — code-vs-docs consistency pass (2026-07)

Autonomous review of `docs/0.5.187/guide/` against the current codebase (no permission-requiring
commands). Driven by the recent commit history (RBAC refactor, per-user login behaviour,
plugin-manager changes, daemon-category retirement).

## Applied fixes (committed)

1. **RBAC — Ops scopes reduced to `ops$get` + `ops$restart`.**
   Source of truth: `plugins/ops/src/common/OpsTypes.ts` (`OPS_SCOPES`) — only GET and RESTART are
   declared/enforced; `ops$execute` and `ops$xterm` **no longer exist** (shell/exec is not gated by
   its own scope in the current version; `EXECUTE` is commented out).
   - `admin/04-security-and-permissions.md` — removed `ops$execute` / `ops$xterm` rows; fixed worked
     example C; added a note that plugins contribute scopes at runtime and there is no xterm/execute
     scope; refined `cluster` to "full access — effectively admin-level" (matches
     `back/src/tools/ScopeCatalog.ts`); aligned `trivy$*` wording with `plugins/trivy/.../TrivyTypes.ts`;
     "checklist" → "searchable selector".
   - `admin/03-user-management.md` — the "open shells → add `ops$xterm`" line now points to `ops$restart`.
   - `extensions/plugins/ops.md` — scopes table trimmed to get/restart + note that shell/exec is not a
     separate scope.
   - `extensions/plugins/magnify.md` — permissions bullet no longer cites `ops$xterm`; cites
     `ops$restart` + `cluster`.

2. **Scope catalog is dynamic** (already reflected in `03-user-management.md` this session): the core
   serves `GET /core/scopes` = `CORE_BUILTIN_SCOPES` + each channel's `getScopeCatalog()`
   (`back/src/tools/ScopeCatalog.ts`, `back/src/index.ts:1173`). Confirmed the ch4 table matches the
   core catalog (cluster, admin, api, view, filter, stream, snapshot, create, subscribe, none).

## Verified OK (no change needed)

- **Login** (`user/02-access.md` + `login.png`): already documents *Enter credentials*, **LOG IN WITH…**
  (SSO) and **CHANGE PASSWORD** (self-service); screenshot is the current dialog. Matches `Login.tsx`.
- **Plugin config gear**: `admin/08-extending-kwirth.md` correctly scopes the ⚙ Settings gear to
  providers/senders/IdPs (NOT plugins) — consistent with commit `33da415` removing the per-plugin JSON
  config gear from the plugin manager.
- **API management** (`admin/05-api-management.md`): consistent with the API Security dialog and the
  shared resource editor.
- **Channel roster**: still the documented 13 (Log, Metrics, Alert, Ops, mIRC, Magnify, Trivy, Fileman,
  Topology, Censor, Pinocchio, News, Echo) — no channel added/removed in recent history.

## Noted for the user (NOT changed — outside the `guide/` tree or needs a decision)

- **"daemon" wording lingers in the OLD reference docs**, not in the guide: `docs/0.5.187/channels/*`,
  `docs/0.5.187/plugins/reference/*`, `docs/0.5.187/developing/back.md`, `docs/0.5.187/apimanagement/*`,
  `docs/0.5.187/commontasks.md`. The code retired the *daemon* extension category (commits `e63a2a3`,
  `608a447`, `8c4ff7c`). The `guide/` tree is clean. Decide whether the reference docs should be scrubbed too.
- **Low priority — screenshots possibly affected by the "dialog padding" cosmetic change** (`b7b75a6`):
  `admin-api-security.png` and the About dialog capture. Functionally still correct; recapture only if
  you want pixel-current padding.
- **HelpButton** (common-front 0.5.26–0.5.28): dialogs can now carry a Help button that opens the guide
  in a popup. Not documented in the guide (it's a UI affordance); mention only if desired.
