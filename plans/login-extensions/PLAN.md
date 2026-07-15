# Login Extensions — Plan

## Overview

New extension type `login` that allows customizing the Kwirth login page. Each extension provides a background image and a configuration file with positioning and text overrides. Multiple login extensions can coexist, each accessible at its own URL slug.

---

## Package structure

```
login-mything.tgz
├── package.json     ← standard metadata
├── login.json       ← dialog configuration
└── background.png   ← optional full-screen background image
```

### `package.json`

```json
{
  "id": "mything",
  "name": "mything",
  "displayName": "My Thing Login",
  "version": "1.0.0",
  "description": "Custom login page for MyThing",
  "targetType": "login"
}
```

### `login.json`

All fields are optional. Omitted fields fall back to Kwirth defaults.

```json
{
  "top": "50%",
  "left": "50%",
  "width": "400px",
  "height": "auto",
  "pageBackground": "#1a1a2e",
  "dialogBackground": "rgba(255,255,255,0.15)",
  "textColor": "#ffffff",
  "title": "Enter credentials",
  "userLabel": "User",
  "passwordLabel": "Password",
  "newPasswordLabel": "New Password",
  "repeatPasswordLabel": "Repeat New Password",
  "changePasswordMessage": "Your login has been successful, you can now change your password.",
  "changePasswordButton": "Change Password",
  "okButton": "OK",
  "orSeparator": "or",
  "idpButton": "Log in with...",
  "startChannel": "magnify"
}
```

**Notes:**
- `startChannel`: channel ID to launch after login (e.g. `"magnify"`, `"log"`). Overrides the user's default `startChannel`. If omitted → user's own default applies.
- `top`/`left`/`width`/`height`: CSS strings (px, %, vh, vw, etc.). Applied as `position: absolute` on the dialog over the full-screen background.
- `dialogBackground`: if omitted → dialog is transparent (no background, no border, no shadow). Fields appear to float directly on the background image. Supports `rgba()` for semi-transparency.
- `pageBackground`: full-screen background color. Used when no `background.png` is present, or as fallback.
- `background.png`: optional. If missing, the default Kwirth background (turbo-pascal) is used.

---

## Back

### New files
- `back/src/tools/LoginManager.ts` — manages install/uninstall, serves files
- `back/src/api/LoginApi.ts` — REST API (modelled on `PluginApi.ts`)

### API endpoints (mounted at `/logins`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/logins` | List installed login extensions |
| POST | `/logins/install` | Install from URL |
| POST | `/logins/upload` | Install from local file (octet-stream) |
| DELETE | `/logins/:id` | Uninstall |
| GET | `/logins/:id/background` | Serve `background.png` (or default if missing) |
| GET | `/logins/:id/config` | Serve `login.json` |

### Storage
- Files stored under `BUNDLED_EXTENSIONS_PATH/../login-extensions/:id/`
- Index persisted in ConfigMap `kwirth-login-index` (same pattern as docs/homepages)

### `EExtensionType`
Add `LOGIN = 'login'` to the enum in `common/src`.

---

## Front

### Routing

| URL | Behaviour |
|-----|-----------|
| `/login` | Default Kwirth login (current `Login.tsx`) |
| `/login/:slug` | Custom login page using the extension with that slug |

### New files
- `front/src/pages/LoginExtensionPage.tsx` — full-screen page: renders `background.png` (or `pageBackground` color) and positions `Login.tsx` absolutely according to `login.json`
- `front/src/components/LoginDialog.tsx` — manager dialog (same UX as `PluginDialog.tsx`: cards, chips, install from URL/file, uninstall, catalog)

### `Login.tsx` changes
Accept optional config props (`ILoginConfig`) to override texts, position and colors. When no config → current behaviour unchanged.

### `ILoginConfig` interface (in `common/src` or front model)

```ts
interface ILoginConfig {
  top?: string
  left?: string
  width?: string
  height?: string
  pageBackground?: string
  dialogBackground?: string
  textColor?: string
  title?: string
  userLabel?: string
  passwordLabel?: string
  newPasswordLabel?: string
  repeatPasswordLabel?: string
  changePasswordMessage?: string
  changePasswordButton?: string
  okButton?: string
  orSeparator?: string
  idpButton?: string
  startChannel?: string
}
```

---

## Folder structure at repo root

```
logins/
├── watch-all.mjs           ← lanza watch.mjs de todas las subcarpetas
├── manifest.json           ← catálogo público
└── turbo-pascal/           ← ejemplo / extensión de referencia
    ├── package.json
    ├── login.json
    ├── background.png
    ├── build.mjs           ← empaqueta los 3 ficheros en dist/turbo-pascal.tgz
    ├── watch.mjs           ← re-empaqueta al detectar cambios en los ficheros fuente
    └── dist/
        └── turbo-pascal.tgz
```

No hay compilación TypeScript/React. El `build.mjs` solo copia `package.json` + `login.json` + `background.png` (si existe) en un `.tgz`.

---

## Dev loading (`kwirth-dev.json`)

```json
{
  "logins": {
    "turbo-pascal": "../logins/turbo-pascal/dist/turbo-pascal.tgz"
  }
}
```

Mismo patrón que `docs` (apunta al `.tgz`, no a una carpeta dist).

---

## Bundled (`kwirth-bundled.json`)

```json
{
  "logins": {
    "turbo-pascal": "bundle/logins/turbo-pascal.tgz"
  }
}
```

---

## Implementation streams

### S1 — Common + Back
1. Add `EExtensionType.LOGIN` to common
2. Implement `LoginManager.ts`
3. Implement `LoginApi.ts` and mount at `/logins` in `index.ts`
4. Default background fallback (serve turbo-pascal PNG)

### S2 — Front routing + page
1. Add `/login/:slug` route in React Router
2. Implement `LoginExtensionPage.tsx` (fetch config + background, render full-screen)
3. Adapt `Login.tsx` to accept `ILoginConfig` props

### S3 — Manager UI
1. Implement `LoginDialog.tsx` (copy `PluginDialog.tsx`, adapt for login)
2. Wire into admin menu

### S4 — QA + e2e
1. Manual QA: install extension, navigate to `/login/:slug`, verify layout
2. e2e: install/uninstall flow, config rendering

---

## Open questions (resolved)

| Question | Decision |
|----------|----------|
| Activate concept? | No — all installed extensions are active at their slug |
| Background PNG optional? | Yes — falls back to default (turbo-pascal) |
| Forced redirect on activate? | No — admin shares the URL manually |
| Public catalog? | Yes + install from URL/file |
| `dialogBackground` transparent? | Yes — omit field for transparent/borderless dialog |
