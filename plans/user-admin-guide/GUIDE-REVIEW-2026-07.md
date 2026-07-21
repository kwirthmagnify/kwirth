# Guide review — code-vs-docs consistency pass (2026-07)

Autonomous review of `docs/0.5.287/guide/` against the current codebase (no permission-requiring
commands). Driven by the recent commit history (RBAC refactor, per-user login behaviour,
plugin-manager changes, daemon-category retirement).

## Coverage — WHOLE guide reviewed (68 pages)

- **Part I (user)** 01–07: read all; only `05-channels.md` needed a fix (see below). 02-access +
  `login.png` already current (Enter credentials / LOG IN WITH… / CHANGE PASSWORD).
- **Part II (admin)** 01–08: read all; `03`/`04` fixed for RBAC (below). 01-deployment (Helm/flags/
  desktop), 02-initial-config (forced first-login password change), 05-api-management, 06-cluster-
  management, 07-idp-integration (5 SSO connectors), 08-extending — all verified current.
- **Part III channels** (13): ops + magnify fixed (RBAC); log, metrics, alert, trivy, fileman,
  topology, censor, pinocchio, news, mirc, echo all verified against code — scope refs valid, no
  behaviour drift. Channel roster (13) and packaging (Metrics/Magnify built-in) accurate.
- **Part III families**: providers (7 installable + 3 built-in), senders (10), idps (5), homepages (4),
  themes (6) — family lists in `extensions/index.md` cross-checked and consistent; no recent code
  changes to these; themes already got Trivy/Ops captures this session.
  Individual fiches sampled across every family (providers: kafka/otel/syslog; senders:
  composite/regex/timed/tee/ratelimit; idps: google + index; homepages/themes indexes) — all
  config-descriptive, accurate, no drift.

## Plugin config gear — CORRECTION to an earlier note

The current build's **PluginDialog.tsx DOES render a ⚙ Settings gear per plugin** (a generic JSON
installation-config editor; endpoints `GET/PUT /plugins/{id}/config`, from commit `2a63d42`). An
earlier note here said plugins had no config gear (based on commit `33da415`); that was reverted/
superseded. Fixed the guide accordingly: `admin/08-extending-kwirth.md` (gear applies to plugins too,
JSON editor) and `extensions/plugins/index.md` (mention the ⚙ Settings per-card icon).

## Screenshots

Recaptured this session (verified): user-management ×3 (PII blurred), themes ×12, magnify
search/viewoptions, extension managers ×6 (plugins now shows the ⚙ gear), admin dialogs ×6
(api-security with key ids blurred, correct manage-extensions menu, workspaces menu). login.png
confirmed current. Remaining dialog/form/selector/chrome recaptures are pending — blocked mid-session
by permission prompts on `node` runs; the affected screenshots differ only by cosmetic dialog padding
(content accurate). Capture scripts live under `plans/user-admin-guide/_cap/` (delete before shipping).

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

- **"daemon" wording lingers in the OLD reference docs**, not in the guide: `docs/0.5.287/channels/*`,
  `docs/0.5.287/plugins/reference/*`, `docs/0.5.287/developing/back.md`, `docs/0.5.287/apimanagement/*`,
  `docs/0.5.287/commontasks.md`. The code retired the *daemon* extension category (commits `e63a2a3`,
  `608a447`, `8c4ff7c`). The `guide/` tree is clean. Decide whether the reference docs should be scrubbed too.
- **Low priority — screenshots possibly affected by the "dialog padding" cosmetic change** (`b7b75a6`):
  `admin-api-security.png` and the About dialog capture. Functionally still correct; recapture only if
  you want pixel-current padding.
- **HelpButton** (common-front 0.5.26–0.5.28): dialogs can now carry a Help button that opens the guide
  in a popup. Not documented in the guide (it's a UI affordance); mention only if desired.
