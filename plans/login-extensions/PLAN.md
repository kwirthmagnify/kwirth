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
  "extensionType": "login"
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

---

## Estado (2026-09-07)

S1–S4 cerrados. Tipo `login` en producción, con estas extensiones vivas: `anonymous`, `magnify`,
`censor` (públicas) y las privadas de excubitor/montag/agora/iter + `santander`.

### Límites del renderer, verificados sobre el dev

`LoginExtensionPage.tsx` es un componente **fijo**: fondo a página completa + **un** panel
posicionable con campos MUI `standard` y botones `outlined` pequeños. El bundle admite `login.json`
+ **un** `background.png`. Consecuencia práctica: para reproducir una pantalla de marca hay que
**hornear el cromo en el PNG** y posicionar el panel encima. Todo lo horneado es decoración no
clicable.

Cuatro comportamientos que no eran obvios (y que ya están documentados en
`docs/0.5.x/guide/extensions/logins/index.md`):

1. **`width` es el ancho del CONTENIDO**, no del panel: el `Box` lleva `p: 3` y no lo incluye. Los
   campos empiezan 24 px dentro de `left`.
2. **`idpButton` solo sustituye `{provider}` con UN IdP.** Con dos o más se imprime la cadena cruda
   y se ve un literal `LOG IN WITH {PROVIDER}`. El default documentado del propio tipo caía en esa
   trampa.
3. **Los themes no llegan a la pantalla de login**: se cargan tras `logged` con petición firmada
   (`App.tsx`, guarda `if (!logged || !backendUrl) return`). El formulario sale siempre con el MUI
   por defecto → **foco azul y botones en MAYÚSCULAS**, no configurables. Un theme de marca no
   arregla el login.
4. **Un dev login se instala solo al arrancar el back**; rebuildear el `.tgz` no refresca la config
   servida (los reintentos hacen *already installed → skipping*). O reinicio, o
   `PUT /core/logins/<id>/config`.

También: `allowedIdps: []` es *truthy* y **oculta todos** los IdP (para ofrecerlos todos hay que
**omitir** la clave), y `startChannel` **bloquea el acceso** a quien no sea admin y no tenga ese
canal en `enabledChannels`.

### Bug abierto — el background de un dev login se cachea una hora

`LoginExtensionApi.ts` (ruta `GET /:id/background`) manda
`Cache-Control: public, max-age=3600` **para todos los logins, incluidos los `dev`**. Eso
contradice el diseño del propio `LoginManager`: para un dev login, `getBackground` **re-extrae el
PNG del `.tgz` en cada peticion**, es decir que está pensado para recarga en vivo.

**Sintoma:** cambias el `background.png`, reconstruyes el `.tgz`, reinicias el back… y sigues
viendo el fondo viejo, porque la copia cacheada está en el navegador y no la tira ni el reinicio.
Cuesta un buen rato de diagnóstico porque todo *parece* correcto en el back (verificado por hash:
sirve los bytes nuevos). Se sale con Ctrl+Shift+R.

**Arreglo propuesto** (una línea, sin efecto en producción — los instalados siguen cacheando):

```ts
res.setHeader('Cache-Control', this.loginManager.isDevLogin(req.params.id)
    ? 'no-store, no-cache, must-revalidate'
    : 'public, max-age=3600')
```

Pendiente de decisión: toca el core, no se ha aplicado.

### Backlog — S5: ampliar el contrato del renderer (V2, no comprometido)

Lo que hoy es imposible y obliga a hornearlo en el PNG. Cada punto es incremental y compatible
hacia atrás (campos nuevos opcionales en `ILoginConfig`; si no se declaran, nada cambia):

| # | Item | Por qué |
|---|---|---|
| S5-1 | **Botón primario con estilo propio** (`okButtonColor`, `okButtonTextColor`, `okButtonRadius`, `okButtonVariant`) | Hoy el CTA es un `outlined` pequeño con el color de `textColor`; ninguna marca con un CTA sólido (pill, relleno) puede reproducir su pantalla. Es el hueco de fidelidad más grande y el más barato de cerrar. |
| S5-2 | **Slot de logo** (`logo.png` en el bundle + `logoTop`/`logoLeft`/`logoWidth`) | Evita hornear el logo, que es justo lo que obliga a regenerar el PNG cuando cambia la marca. |
| S5-3 | **Enlaces declarativos** (`links: [{label, url, position}]`) | El pie legal (privacidad, cookies, términos) es obligatorio en banca/seguros y hoy solo puede ir horneado, es decir **no clicable** — un enlace legal que no navega es un problema, no un detalle estético. |
| S5-4 | **`rememberUser`** (checkbox opcional) | Presente en casi cualquier login corporativo. |
| S5-5 | **`textTransform` / tipografía del panel** (`fontFamily` sobre fuentes del bundle) | Cierra el hueco que dejan los themes al no aplicarse en el login (punto 3). |
| S5-6 | **Ocultar `changePasswordButton`** (`showChangePassword: false`) | Hoy siempre se pinta si hay login por password, y aparece un segundo botón que la pantalla de referencia no tiene. |
| S5-7 | **Layout de dos columnas** (`splitImage`, `splitAt`) | Sustituiría la técnica de hornear la columna de la foto, y arreglaría el recorte de `cover` en aspectos que no son 16:9. |

⚠️ Antes de tocar `ILoginConfig` hay que revisar los 5 logins públicos y los 5 privados: los
porcentajes de posición están calculados contra su propio PNG y un cambio en el box model del panel
(padding, ancho) los desalinea a todos a la vez.
