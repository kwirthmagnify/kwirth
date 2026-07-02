# Plan detallado: Autenticación vía IdP externo (SSO) como extensión

> Estado: **borrador para revisión**. No se ha escrito código.
> Primer proveedor objetivo: **Google / Gmail (OIDC)**.
> Modelo: **IdP como categoría de extensión** (como plugins/providers/senders), configurable desde el front.

---

## 0. TL;DR

El IdP **solo verifica identidad**. Kwirth **sigue autorizando** con su lista blanca `kwirth-users` (clave = email) + binding de IdP por usuario. La integración se modela como una **nueva categoría de extensión** ("Identity Providers"): conectores **bundled + instalables**, configurables **desde el front**, con toda la config (incluidos secretos) en **un único Secret** `kwirth-idps`.

Separación clave por seguridad:
- **Conector** = *lógica pura* (construir URL de auth, validar token, extraer email). Bundled o instalable. NO expone rutas.
- **Core (`AuthApi`)** = flujo HTTP pre-login (`/core/auth/...`) + emisión de AccessKey + gate de lista blanca/binding. **Nunca** sale del core.

---

## 1. Estado actual (código real)

### Back
- `index.ts:118` `envAuth = process.env.AUTH || 'kwirth'`; `index.ts:119` `envMasterKey`.
- `index.ts:2441-2451` middleware que enruta a la *running instance* activa; **`/core/auth/` exento** (`index.ts:2444`) → sitio para los endpoints pre-login.
- `index.ts:2452-2454` `GET /core/auth/method` devuelve hoy `{ auth: envAuth }`.
- `index.ts:1146-1147` `LoginApi` montado por instancia en `riRouter.use('/login', ...)`.
- `LoginApi` (`back/src/api/LoginApi.ts`): `readUsersSecret`, `createApiKey` (crea AccessKey `permanent`, persiste en `kwirth.keys`, 24h), `okResponse`.
- `UserApi` (`back/src/api/UserApi.ts`): CRUD de `kwirth-users` (persiste el body tal cual → `idp` se guarda solo).
- `ApiKeyApi.create(configMaps, masterKey, isDesktop)`; `validKey()`.
- **Patrón de extensión (a replicar)**: `ProviderManager` (`back/src/tools/ProviderManager.ts`) — registry, install/uninstall, dev mode (`kwirth-dev.json`), hot-reload, **schema de config** (`IProviderSchemaField` con `type: 'password'`), config store, front.js dinámico. `ProviderApi` expone su gestión; `ManageProviders`/`ProviderDialog` en el front.
- Almacenes: `ISecrets` (para secretos) y `IConfigMaps` (`read/write/writeKey/readAllKeys`).

### Front
- `front/src/index.tsx:54/64` — `fetch('/core/auth/method')` antes de montar `<App>`, pasa `auth={auth.auth}`.
- `App.tsx:58` prop `auth: string`; `App.tsx:1921-1938` branch `kubeconfig` / `Login`.
- `App.tsx:1824-1843` `onLoginClosed(user, firstTime)` → set sesión + `accessString`.
- Drawer: `MenuDrawer.tsx:75-96` submenú "Manage extensions" **dentro de `hasClusterScope`** (admin) con Plugins/Providers/Senders/Daemons/Themes/Homepages. `App.tsx:1614-1631` gestiona esas opciones.
- `hasClusterScope()` (`App.tsx:1757`) = usuario con scope `cluster` (= admin).

### Modelo
- `IUser` (`common/src/Global.ts:3-9`): `{ id, name, password, accessKey, resources }`. `id` = username (= email para usuarios IdP).

---

## 2. Principios y decisiones de arquitectura

- **NO se toca**: `AuthorizationManagement`, `AccessKey`, `resources`, `createApiKey()` (se reusa), channels, scopes, `SessionContext`.
- Método **`kwirth`** (user/pass) se mantiene (admin bootstrap). **`kubeconfig`** se mantiene como rama especial (no es IdP).
- **Matching por email + binding de IdP**: `id` del usuario = email; `IUser.idp` ata al usuario a un IdP concreto. Gate = `email_verified` + estar en `kwirth-users` + `user.idp === instanceId`. Alta manual (lista blanca), sin auto-provisión.
- **IdP = categoría de extensión** con conectores **bundled + instalables**.
- **Conector = lógica pura** (`IIdpConnector`), sin rutas propias. El flujo HTTP pre-login y la emisión de AccessKey viven en el core (`AuthApi`).
- **Config desde el front** (admin), no env vars. Toda la config de todos los IdPs en **un único Secret** `kwirth-idps` (incluye `clientSecret`).
- **Alcance Fase 1 = web/server**. Desktop fuera (redirect OIDC necesita loopback/deep-link).

### Seguridad de los conectores instalables
Instalar un conector de IdP = confiar código con la capacidad de decidir identidades. Guardarraíles:
- Install/uninstall **solo admin** (`hasClusterScope`).
- **Aviso explícito** en la UI al instalar ("este conector participa en la autenticación").
- El conector es lógica pura invocada por el core; **no** expone rutas ni emite AccessKeys por su cuenta.
- Los bundled (first-party) van marcados como tales frente a los instalados.

---

## 3. Conectores (realidad de proveedores)

| Conector | Cubre | Protocolo | Email |
|---|---|---|---|
| `google` | Gmail / Workspace | OIDC | claim `email` (+`hd`) |
| `generic-oidc` | Keycloak, GitLab, otros OIDC | OIDC (issuer configurable) | claim `email` |
| `microsoft` | Entra ID / O365 / outlook.com | OIDC (tenant) | claim `email`/`preferred_username` |
| `github` | GitHub | **OAuth2 (no OIDC)** | API `/user/emails` |

Fase 1 desarrolla el conector **`google`** como artefacto `idps/google/`, cargado en **dev** durante el desarrollo (shippable como **bundled**, e instalable en runtime). El resto en fases siguientes. Terceros pueden aportar conectores instalables.

---

## 4. Tipos nuevos (a validar antes de crear)

### 4.1 `common/src/AuthMethod.ts` (back↔front)
```ts
enum EAuthMethodKind {
    PASSWORD = 'password',   // kwirth → formulario user/pass
    REDIRECT = 'redirect'    // IdP → botón que navega a startUrl
}
interface IAuthMethod {
    id: string               // instanceId del IdP, o 'kwirth'
    label: string
    kind: EAuthMethodKind
    startUrl?: string         // solo REDIRECT
}
```

### 4.2 `common/src/Global.ts` — cambio en `IUser` EXISTENTE
```ts
interface IUser {
    id: string                 // = email para usuarios IdP
    name: string
    password: string           // vacío para usuarios IdP
    accessKey: AccessKey
    resources: string
    idp?: string               // instanceId del IdP; vacío/undefined = usuario local kwirth
}
```
`idp` es `string` (conjunto de IdPs configurable, no union fijo).

### 4.3 `back` — conector e instancia
```ts
// back/src/tools/idp/IIdpConnector.ts
enum EIdpConnectorKind { OIDC = 'oidc', OAUTH2 = 'oauth2' }

interface IIdpIdentity {
    email: string
    emailVerified: boolean
    name?: string
    sub?: string               // identificador estable del IdP (para hardening futuro)
}

interface IIdpConnector {
    connectorId: string        // 'google' | 'generic-oidc' | ...
    label: string
    kind: EIdpConnectorKind
    getConfigSchema(): IProviderSchemaField[]                 // reutiliza el tipo de ProviderManager
    buildAuthorizationUrl(cfg: Record<string,unknown>, ctx: IIdpAuthContext): Promise<string> | string
    handleCallback(cfg: Record<string,unknown>, ctx: IIdpCallbackContext): Promise<IIdpIdentity>
}

interface IIdpAuthContext { redirectUri: string; state: string; codeChallenge: string }
interface IIdpCallbackContext { code: string; codeVerifier: string; redirectUri: string }

// Instancia configurada (lo que se guarda en el Secret kwirth-idps)
interface IIdpInstanceConfig {
    id: string                 // instanceId (p.ej. 'google', 'corp-keycloak') = IUser.idp
    connectorId: string        // qué conector usa
    label: string              // texto del botón de login
    enabled: boolean
    config: Record<string, unknown>   // clientId, clientSecret, issuer, scopes... (según schema del conector)
}
```
> `IProviderSchemaField` (con `type:'password'`) se **reutiliza** de `ProviderManager` (no se duplica). Si conviene, se extrae a `common-back` o a un módulo compartido — a decidir en implementación.

---

## 5. Endpoints

### 5.a Core — runtime pre-login (`AuthApi`, montado en `/core/auth/`, exento)

**`GET /core/auth/method`** — lee las instancias `enabled` del Secret `kwirth-idps` y devuelve:
```jsonc
{ "methods": [
    { "id": "kwirth", "label": "User & password", "kind": "password" },
    { "id": "google", "label": "Login with Google", "kind": "redirect", "startUrl": "/core/auth/google/start" }
]}
```

**`GET /core/auth/:instanceId/start`**
1. Cargar `IIdpInstanceConfig` del Secret; 404 si no existe/deshabilitada. Resolver su conector de `registeredIdps`.
2. `state` + PKCE (S256) → **AuthStateStore** (TTL 10 min).
3. `redirectUri = getBaseUrl(req) + '/core/auth/' + instanceId + '/callback'`.
4. `302` a `connector.buildAuthorizationUrl(cfg, { redirectUri, state, codeChallenge })`.

**`GET /core/auth/:instanceId/callback?code=&state=`**
1. Recuperar+borrar `state` (single-use). Si falla → `?ssoerror=state`.
2. `identity = connector.handleCallback(cfg, { code, codeVerifier, redirectUri })`.
3. `identity.emailVerified !== true` → `?ssoerror=unverified`.
4. `user = users[identity.email]`; no existe → `?ssoerror=notfound`.
5. `user.idp !== instanceId` (o vacío) → `?ssoerror=idpmismatch`.
6. `IdentityService.issueAccessKey(user, ip, ...)` → `ILoginResponse`.
7. `handoffCode` → **HandoffStore** (TTL 60s, single-use).
8. `302` a `getBaseUrl(req) + '/front?sso=' + handoffCode`.

**`POST /core/auth/exchange { code }`** — recupera+borra el handoff, devuelve `200 ILoginResponse` o `404`.

> **Derivación de URLs**: `getBaseUrl(req) = `${proto}://${host}${envRootPath}`` con `proto = x-forwarded-proto || req.protocol`, `host = x-forwarded-host || req.get('host')` (mismo patrón proxy que `index.ts:2112`), reutilizando `envRootPath` (`index.ts:112-115`). Sirve para `localhost:3883` y `.../kwirth` sin config extra; el SPA está en `${envRootPath}/front` (`index.ts:2436/2458`).

### 5.b Gestión — admin (`IdpApi`, montado en `riRouter`, `validKey` + admin)
- `GET /idp/connectors` — tipos de conector disponibles (bundled + instalados) con su `label`/`kind`/`schema`.
- `GET /idp` — instancias configuradas (sin exponer secretos: los `password` se devuelven enmascarados).
- `POST /idp` / `PUT /idp/:id` / `DELETE /idp/:id` — crear/editar/borrar instancia (guarda en Secret `kwirth-idps`).
- `POST /idp/connectors/install` / `DELETE /idp/connectors/:connectorId` — instalar/desinstalar conector (tar.gz, como providers). **Admin + aviso**.
- Export/import de la config (JSON) — requisito de componentes core.

---

## 6. Refactor: `IdentityService` (emisión compartida, evitar duplicar)
```ts
// back/src/tools/auth/IdentityService.ts
class IdentityService {
    static async readUsers(secrets): Promise<Record<string,string>|undefined>
    static findUserByEmail(users, email): IUser|undefined
    static async issueAccessKey(user, ip, configMaps, apiKeyApi): Promise<ApiKey|undefined>  // = createApiKey actual
    static okResponse(user): ILoginResponse
}
```
`LoginApi` (método `kwirth`) y `AuthApi` (IdP) delegan aquí. **CA**: login `kwirth` idéntico tras el refactor.

---

## 7. `IdpManager` (nueva categoría de extensión)
`back/src/tools/idp/IdpManager.ts`, espejo de `ProviderManager` pero:
- Registry `registeredIdps: Map<connectorId, IIdpConnectorConstructor>` — **bundled** (registrados en código: `google`, ...) **+ instalados** (dynamic require de `back.js`, como providers) + dev (`kwirth-dev.json`).
- Conectores instalables: mismo mecanismo tar.gz/configmap que providers, pero el artefacto exporta un `IIdpConnector` (lógica pura), no rutas.
- **Config de instancias en Secret único `kwirth-idps`** (no per-id, no ConfigMap): `{ [instanceId]: IIdpInstanceConfig }`. Vía `ISecrets`.
- `list/enable/getInstance/saveInstance/deleteInstance`, `getConnectorSchema`, `installConnector/uninstallConnector`, `exportConfig/importConfig`.

## 8. Stores en memoria (proceso único)
- `AuthStateStore` (`state → { instanceId, codeVerifier, createdAt }`, TTL 10 min, single-use).
- `HandoffStore` (`handoffCode → { response, createdAt }`, TTL 60s, single-use).
- Purga perezosa + `setInterval`.

## 9. Montaje (back)
- `AuthApi` (core, pre-login): instanciado en arranque (~`index.ts:2452`), `app.use('${envRootPath}/core/auth', authApi.router)`. Resuelve la RI activa (`runningInstances.find(r=>r.active)`) para `secrets`/`configMaps`/`apiKeyApi`, y usa `idpManager` + `registeredIdps`.
- `IdpApi` (gestión, admin): `riRouter.use('/idp', idpApi.router)` (~`index.ts:1146`).
- `IdpManager` creado en el bootstrap de managers (junto a Provider/Sender managers): `loadDevIdps` (dev), `installBundled` (bundled), `loadAll` (installable). `registeredIdps` se puebla por esas 3 vías. La infra (`AuthApi`/`IdpApi`/`IdpManager`/`IIdpConnector`/`IdentityService`) va compilada en `back/src`.

## 10. Setup externo (Google) — ver docs/0.5.187/idp/google.md
Registrar OAuth client (Web application), consent screen External, redirect URI `https://<host>[/rootpath]/core/auth/google/callback` (+ localhost dev), scopes `openid email profile` (no sensibles → sin verificación), test users. `client_id`/`client_secret` se meten **desde el front** (no env).

## 11. Config
- **Única fuente: Secret `kwirth-idps`** (todas las instancias, con secretos). Editable desde el front (admin).
- **Sin env vars** para IdP (se elimina el enfoque `AUTH_*`). `AUTH`/`kwirth`/`kubeconfig` del core se mantienen para los métodos no-IdP.
- Export/import JSON desde la UI (los `password` se tratan con cuidado al exportar).

## 12. Front
- `front/src/index.tsx` — consumir `methods: IAuthMethod[]`.
- `front/src/App.tsx` — prop `authMethods`, branch (mantener `kubeconfig`), `useEffect` handoff `?sso=` (POST `/core/auth/exchange` → `onLoginClosed`), limpiar query.
- `front/src/components/Login.tsx` — formulario `kwirth` si presente + botón por método REDIRECT.
- **Gestión de IdPs (admin)** — nuevo `MenuDrawerOption.ManageIdps` en el submenú "Manage extensions" (`MenuDrawer.tsx`, ya dentro de `hasClusterScope`), y componente `ManageIdps`/`IdpDialog` espejo de `ManageProviders`/`ProviderDialog`: listar conectores, crear/editar instancia con **form generado desde el schema** (incluye campos `password`), enable/disable, instalar conector (con aviso), export/import.
- `front/src/components/security/ManageUserSecurity.tsx` (A7) — selector de IdP poblado desde `/idp` (instancias enabled); IdP seleccionado ⇒ `id`=email, sin password, guarda `user.idp`.

## 12.b Empaquetado, build y las 3 situaciones de carga (NO confundir)

**Core compilado (no es extensión)**: `AuthApi`, `IdpManager`, `IdpApi`, interfaz `IIdpConnector`, `IdentityService`, stores. Van en `back/src`, compilan con el back. Precedente: `registeredProviders.set('events', ...)` en `index.ts:141-143`.

**Un conector = un artefacto empaquetable**: folder top-level **`idps/<id>/`** (espejo de `providers/`): `src/index.ts` exporta el `IIdpConnector` (+ `schema`), con `build.mjs`, `watch.mjs`, `package.json` (`id`,`name`,`displayName`,`version`), `tsconfig.json`. `build.mjs` (esbuild) → `dist/back.js` + `dist/package.json` (**NO genera tgz**; el `.tgz` sale de `npm pack`/`publish` sobre `dist/`). Más `idps/manifest.json` (marketplace) y `idps/watch-all.mjs`.

Ese mismo artefacto se puede cargar de **3 formas distintas** (no confundir):

| Situación | Declaración | Carga | Uso |
|---|---|---|---|
| **Dev** | `kwirth-dev.json` → `idps: { id: distPath }` (gitignored) | `IdpManager.loadDevIdps` + `watch.mjs` hot-reload | desarrollo local |
| **Bundled** | `kwirth-bundled.json` → `idps: { id: url }` + `scripts/fetch-bundled.mjs` (fetch en build a la imagen) | `IdpManager.installBundled(dir)` en arranque, `installedFrom='bundled'` (no uninstall) | pre-instalado en un release |
| **Installable** | `idps/manifest.json` / subida por UI | `IdpApi` (admin, runtime) → `install`/`installFromBuffer` | añadido en runtime |

- **Google (Fase 1)**: se desarrolla como **dev** (`kwirth-dev.json`). Para release, se añade a **`kwirth-bundled.json`**. Es instalable por naturaleza (mismo tgz). NO va compilado en `back/src`.
- `IdpManager` reproduce el patrón de `ProviderManager`: `loadDevIdps`, `installBundled`, `install`/`uninstall`, más la config en Secret `kwirth-idps`.

### `kwirth-dev.json` (dev) vs `kwirth-bundled.json` (bundled) — ficheros DISTINTOS
- **`kwirth-dev.json`** (gitignored): añadir clave **`idps`** (`{id: distPath}`) y opcional **`idpConfigs`** (espejo de `senderConfigs`, precarga instancias en el Secret `kwirth-idps` con interpolación `${ENV}`):
```jsonc
"idps": { "google": "../idps/google/dist" },
"idpConfigs": {
  "google": { "connectorId": "google", "label": "Login with Google", "enabled": true,
    "config": { "clientId": "${GOOGLE_CLIENT_ID}", "clientSecret": "${GOOGLE_CLIENT_SECRET}", "scopes": "openid email profile", "issuer": "https://accounts.google.com" } }
}
```
- **`kwirth-bundled.json`** (versionado): añadir clave **`idps`** (`{id: url-del-tgz}`) cuando se decida shippear un conector pre-instalado.

## 13. Dependencias
- `openid-client` **v5** (CommonJS; v6 ESM-only rompería interop) — dependencia **del artefacto conector** (`idps/google/package.json`), bundeada con esbuild en su `dist/back.js`. NO en `back/package.json`.
- Back core y front: sin nuevas dependencias.

---

# BACKLOG

Prioridad: **P0** = Fase 1 (Gmail E2E vía extensión) · **P1** = más conectores · **P2** = futuro.
Formato: *ficheros · qué hace · criterio de aceptación (CA)*.

## EPIC T — Harness de test automatizado (P0, transversal)
- **T0** Harness propio del back (patrón defender): `back/tests/run.mjs` (esbuild → `.mjs` → `node --test`, cero deps nuevas), script `test`, `tests/.out/` en gitignore. `back/tsconfig.json` → `"include": ["src"]` para que el `tsc` del build no incluya `tests/` (salida byte-idéntica) · *CA*: `npm test` verde + `tsc --noEmit` exit 0. ✅ **HECHO**
- **T1** Test de `IdentityService` (readUsers/findUser/createApiKey/okResponse con mocks) · `back/tests/tools/auth/IdentityService.test.ts` · *CA*: cubre camino feliz + fallback + negativos. ✅ **HECHO (9/9)**
- **T2** Test de ruta de `LoginApi` (express efímero + `fetch`): login 200/201/401, change-password 200/401 · `back/tests/api/LoginApi.test.ts` · *CA*: wiring HTTP verde. ✅ **HECHO (6/6)**
- **Tn** Cada stream nuevo añade sus tests en `back/tests/**` espejando `src/`.

## EPIC A — Andamiaje multi-método + tipos (P0)
- **A1** `IAuthMethod`/`EAuthMethodKind` · `common/src/AuthMethod.ts` + `index.ts` export. ✅ **HECHO** (common 0.5.18)
- **A2** `IUser.idp?` · `common/src/Global.ts`. ✅ **HECHO** (common 0.5.18)
- **A3** Front consume `methods[]` · `index.tsx` (pasa `authMethods={auth.methods}`). ✅ **HECHO**
- **A4** Prop `authMethods` + handoff `?sso=` (useEffect + `/exchange`) · `App.tsx` · mantiene branch `kubeconfig` en `props.auth`. ✅ **HECHO** (front tsc verde)
- **A5** Login multi-método: form `kwirth` si hay PASSWORD + botón por método REDIRECT (`backendUrl+startUrl`) · `Login.tsx`. ✅ **HECHO**
- **A6** Stores memoria · `back/src/tools/auth/TtlStore.ts` (genérico single-use+TTL+clock inyectable; sustituye a los dos ficheros AuthStateStore/HandoffStore). ✅ **HECHO** (4 tests)

## EPIC B — Infra de extensión IdP (P0)
- **B0** Refactor `IdentityService` · `back/src/tools/auth/IdentityService.ts`, `LoginApi.ts` · *CA*: `kwirth` idéntico. ✅ **HECHO** (15 tests)
- **B1** `IIdpConnector` + tipos (`EIdpConnectorKind`, `IIdpConfigFieldDef`, `IIdpIdentity`, contexts, `IIdpInstanceConfig`, `TIdpConnectorConstructor`) → **movidos a `common-back/src/IIdpConnector.ts`** (como `ISender`/`IProvider`, para que los conectores-paquete los implementen). **common-back publicado 0.5.16**, reinstalado en back. Back importa de `@kwirthmagnify/kwirth-common-back`; borrado el fichero local. `IIdpConfigFieldDef` reemplaza al `IProviderSchemaField` que usé de atajo. ✅ **HECHO** (40/40 verde)
- **B2** `IdpManager` (registry bundled+dev, config de instancias en Secret `kwirth-idps`, `loadDevIdps`/`loadDevIdpConfigs`, export/import) · `back/src/tools/idp/IdpManager.ts`. ✅ **HECHO** (8 tests). Install de tgz (instalables/`installBundled`) → **EPIC G**.
- **B3** `IdpApi` (gestión admin: connectors/instancias, export/import, enmascarado de secretos) · `back/src/api/IdpApi.ts`. ✅ **HECHO** (5 tests). Install de tgz → EPIC G. Montaje en `index.ts` → B5.
- **B4** `AuthApi` core pre-login (`/method`, `/:id/start`, `/:id/callback`, `/exchange`, derivación URL) · `back/src/api/AuthApi.ts`. ✅ **HECHO** (7 tests E2E). Falta el **montaje en `index.ts`** (va con B5).
- **B5** Montaje en `index.ts`: `IdpManager` (secrets de la RI) + `loadDevIdps`/`loadDevIdpConfigs` en `setUpRoutes`, `IdpApi` en `/idp`, `AuthApi` (idpManager+context lazy) en `/core/auth` sustituyendo el `/core/auth/method` inline. `/method` devuelve `{auth, methods}` (back-compat). ✅ **HECHO** (tsc verde, 40/40).

## EPIC C — Conector Google (P0)
- **C1** Lógica OIDC compartida (`openid-client` v5) → **common-back** (`oidc.ts`: `oidcConfigSchema`/`oidcBuildAuthorizationUrl`/`oidcHandleCallback`, funciones, NO herencia). Expuesta por el global `__kwirth_back__.kwirthCommonBack`; los conectores la usan por composición sin bundlear openid-client. **common-back bbp 0.5.17** + reinstalado en back. ✅ **HECHO**
- **C2** Conector `google` (artefacto `idps/google/`, fino: id/label/kind + issuer default, delega en los helpers OIDC del global). `build.mjs`/`watch.mjs` con el plugin `kwirth-back-globals` (mapea `@kwirthmagnify/*` al global; cero deps de runtime propias). ✅ **HECHO** (build + smoke test vía global OK)
- **C3** Gate lookup+binding+emisión en `AuthApi` (cubierto por B4/B5, 7 tests E2E con conector fake) · usuario en lista+IdP correcto entra; fuera → `notfound`; IdP distinto → `idpmismatch`; no verificado → `unverified`. ✅
- **C4** Handoff front (`?sso=` useEffect) · `App.tsx`. ✅ (hecho en A4)
- **C5** Dev: `idps.google` + `idpConfigs.google` en `back/kwirth-dev.json` (hot-reload del conector + precarga instancia en Secret `kwirth-idps` con `${GOOGLE_CLIENT_ID/SECRET}`). ✅ **HECHO**

## EPIC D — UI de gestión de IdPs (P0, admin)
- **D1** `MenuDrawerOption.ManageIdps` + entrada en submenú "Manage extensions" (icono Key) + estado/case/render en `App.tsx`. ✅ **HECHO** (front tsc verde)
- **D2** `ManageIdps` (espejo de `ProviderDialog`: cards + list toggle + filtros + versiones + install URL/fichero + marketplace). **Config lanzada desde la card del conector** (icono Settings, como providers/homepages): 1 instancia por conector (id=connectorId), form schema-driven con enable + campos `password`. Endpoints de install de conectores (`/idp/connectors/*`) son de EPIC G (UI cableada). ✅ **HECHO**
- **D3** Selector de IdP en alta de usuarios · `ManageUserSecurity.tsx`: Select "IdP" (Local + instancias enabled); si IdP → password disabled y no requerido; guarda `user.idp`. ✅ **HECHO**

## EPIC E — Setup y pruebas Google (P0)
- **E1** Doc/setup Google (ya en docs) + alta de instancia `google` desde la UI.
- **E2** E2E: (a) usuario en lista entra con `resources`; (b) fuera de lista rechazado; (c) email no verificado; (d) `state` reusado; (e) `kwirth` sigue OK; (f) config persiste en Secret `kwirth-idps`.

## EPIC F — Más conectores (P1)
- **F1** `generic-oidc` (Keycloak/GitLab) · **F2** `microsoft` · **F3** `github` (OAuth2, `/user/emails`).

## EPIC G — Conectores instalables + hardening (P1)
- **G0** Scaffolding top-level `idps/` (`idps/google/` con build.mjs/watch.mjs, `idps/manifest.json`) + `IdpManager.loadDevIdps` (clave `idps` en `kwirth-dev.json`). ✅ **HECHO**
- **G1** install/uninstall de conectores (tgz vía URL/upload, `installBundled`, `loadAll` en arranque) · `IdpManager` (índice+meta+back.js comprimido en configmap, espejo de `ProviderManager`) + `IdpApi` (`POST /idp/connectors/install`, `POST /idp/connectors/upload`, `DELETE /idp/connectors/:id`, **admin via validKey**) + montaje `init/loadAll/installBundled` en `index.ts`. Harness ESM con `require` inyectado (banner). ✅ **HECHO** (test install/loadAll/uninstall con tgz real; 44/44).
- **G2** auditoría de logins IdP (`ELogComponent.AUTH`, ya se loguea OK/rechazos en `AuthApi`) · **G3** doc de seguridad (docs/idp) · **G4** *(opcional)* binding por `sub` (TOFU). ⬜ pendiente

## EPIC H — Desktop SSO (P2)
- **H1** flujo loopback/deep-link (electron/tauri).

## Dependencias
`A + B0/B1/B2 → B3/B4/B5 → C → D → E`. `F/G` tras `C`. **Fase 1 (Gmail) = A + B + C + D + E.**

---

## 14. Decisiones (CERRADAS)
- [x] Matching por email + **binding de IdP** (`IUser.idp` = instanceId).
- [x] Gate = `email_verified` + en `kwirth-users` + `user.idp === instanceId`. Sin restricción de dominio. Alta manual.
- [x] `kwirth` se mantiene; `kubeconfig` rama especial.
- [x] `openid-client` v5.
- [x] Handoff Opción B (`?sso=<code>` + `/exchange`, single-use TTL 60s).
- [x] URLs derivadas de request + `envRootPath` (no `FRONTURL`).
- [x] **Modelo extensión** para IdP (nueva categoría).
- [x] Conectores **bundled + instalables** (instalables con guardarraíles de seguridad, §2).
- [x] Config **desde el front**, en **un Secret único** `kwirth-idps` (todos los IdPs).
- [~] **Tipos** `IAuthMethod`/`EAuthMethodKind`, `IUser.idp`, `IIdpConnector`/`IIdpInstanceConfig`/`EIdpConnectorKind`: pendiente visto bueno.

---

## 15. Ficheros afectados — Fase 1
> ⚠️ Colisión: `front/src/App.tsx`, `back/src/index.ts` (grandes/compartidos). Cascada: `common` es publicado → para que back/front vean los tipos nuevos hay que **bbpm** (bump+build+publish+reinstall). **NO symlinks** (regla de proyecto).
> La otra sesión trabaja en un plugin → sin solape con estos (core).

### common (publicado)
- **NUEVO** `common/src/AuthMethod.ts` (A1) · MOD `common/src/index.ts` (A1) · MOD `common/src/Global.ts` `IUser.idp` (A2).

### back
- **NUEVO** `back/src/tools/auth/IdentityService.ts` (B0), `AuthStateStore.ts`, `HandoffStore.ts` (A6)
- **NUEVO** `back/src/tools/idp/IIdpConnector.ts` (B1), `IdpManager.ts` (B2)
- **NUEVO** `back/src/api/AuthApi.ts` (B4), `back/src/api/IdpApi.ts` (B3)
- MOD `back/src/api/LoginApi.ts` (B0), `back/src/index.ts` (montajes core, `loadDevIdps`/`installBundled`, quitar `/core/auth/method` inline) (B3/B4/B5)

### idps/ (artefacto conector — extensión, NO back/src)
- **NUEVO** `idps/google/` (src/index.ts + build.mjs + watch.mjs + package.json + tsconfig.json) — conector Google, dep `openid-client` v5 (C1/C2)
- **NUEVO** (EPIC G) `idps/manifest.json` + `idps/watch-all.mjs`

### dev / bundled (ficheros distintos)
- MOD (dev, gitignored) `back/kwirth-dev.json` — `idps.google` (distPath) + `idpConfigs.google` (C5)
- MOD (release) `back/kwirth-bundled.json` — `idps` con tgz cuando se shippee pre-instalado (G0)

### front
- MOD `front/src/index.tsx` (A3), `front/src/App.tsx` (A4/C4), `front/src/components/Login.tsx` (A5)
- **NUEVO** `front/src/components/ManageIdps.tsx` + `IdpDialog.tsx` (D2)
- MOD `front/src/menus/MenuDrawer.tsx` (D1), `front/src/components/security/ManageUserSecurity.tsx` (D3)

### NO se tocan
`AuthorizationManagement.ts`, `AccessKey.ts`, `ApiKey.ts`, `ApiKeyApi.ts`, `UserApi.ts` (persiste `idp` solo), `SessionContext.ts`.
