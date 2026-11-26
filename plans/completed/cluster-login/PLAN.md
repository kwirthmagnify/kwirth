# Clusters con conexión «login» — PLAN

> ✅ **ESTADO — CERRADO el 2026-11-26** (build 0.6.134). F1–F5 entregadas y **QA del usuario validado**: 15 tests
> unitarios del front (`npm run test:unit`), e2e `cluster-login.spec.ts` 4/4 y la regresión de clusters y
> selector en verde (24 ✅ · 3 ⏭). Guía (*Signing in to a cluster*, con captura del diálogo por
> `capture-clusters.spec.ts`), website (*Kwirth Mesh*, *Getting started*) y changelog. Lo que queda fuera está
> abajo, en *Fuera de esta versión*.
>
> Cuelga de [PRD.md](PRD.md) (D1–D6). Todo es **front**: el back del remoto ya da lo necesario (`POST /login`, CORS)
> y la lista de clusters se guarda en el back propio tal cual, sin interpretarla.

## Lo que hay hoy (los enganches)

- `front/src/model/Cluster.ts`: `url`, `accessString` (la key), `route` (conectividad por router), `inUse`, `enabled`.
- `tools/Global.ts → readClusterInfo`: lee `/config/info` y `/config/cluster` del remoto con `accessString`; decide
  `enabled`. Es el primer sitio donde una key caducada da 401.
- `components/home/ResourceSelector.tsx`: al elegir cluster pide namespaces, grupos y pods con su key.
- `components/home/ManageClusters.tsx`: alta y edición; conectividad = `Route` (Direct o un router).
- `App.tsx → onManageClustersClosed`: guarda la lista entera en `/store/<user>/clusters/list`.
- `tools/ClusterRouting → resolvedClusterUrl(cluster)`: la URL efectiva, directa o por router. El login del
  remoto va **por la misma**, así funciona también detrás de bridge o Ianus (D1).

## Tipos nuevos (a validar)

```ts
// front/src/model/Cluster.ts
export enum EClusterCredentials {
    KEY = 'key',       // la access key de la entrada (lo de siempre)
    LOGIN = 'login'    // la key se obtiene haciendo login en el remoto (PRD)
}
// en Cluster:
credentials?: EClusterCredentials   // ausente = KEY: las entradas que ya existen no cambian
remoteUser?: string                 // LOGIN: con qué usuario se entró en el remoto (para "as <user>")
```

La key obtenida va en el `accessString` de siempre (D2): el resto del front no cambia.

## Fases

| # | fase | qué |
|---|---|---|
| F1 | **Modelo y login** | `EClusterCredentials` + `remoteUser` en `Cluster`. `tools/ClusterLogin.ts`: `loginToCluster(cluster, user, password)` → `POST <resolvedClusterUrl>/login` (sha256 de la contraseña, como el login propio) y traduce la respuesta a un resultado tipado: OK (key + usuario), credenciales incorrectas (401), demasiados intentos (429 + `Retry-After`), IP no permitida, cambio de contraseña pendiente (201, D4), remoto inalcanzable. Tests unitarios (`front/tests`, `npm run test:unit`) |
| F2 | **Diálogo de login** | `ClusterLoginDialog`: nombre y URL del cluster a la vista, usuario y contraseña (con el ojo), motivo de apertura (*sin sesión* / *la sesión en este cluster ha caducado*, D5) y el error con su motivo. Cancel/Login. Contenido fijo |
| F3 | **Manage clusters** | Selector **Credentials** (*API key* / *Login*) junto a *Route*. Con *Login*, *API Key* deshabilitado y vacío; *SAVE* no exige key. *TEST* sin credenciales comprueba que el remoto responde. En la fila: `as <remoteUser>` y acción **Sign out** (borra key y usuario) |
| F4 | **Usarla** | `readClusterInfo`: una entrada LOGIN sin key no se lee (queda *needs login*); un 401/403 marca *expired*. Al **elegirla en el selector de recursos** (o abrir algo sobre ella) en estado *needs login* / *expired*, se abre el diálogo; al entrar se guarda la key, se persiste la lista (el mismo guardado de `onManageClustersClosed`, extraído a una función) y se sigue. El selector muestra `<cluster> · as <remoteUser>` |
| F5 | **Pruebas y guía** | e2e: una entrada LOGIN contra el propio back de dev (otro usuario distinto del de la sesión), login, uso, *Sign out*, key inválida → diálogo con *expired*. Guía de *Cluster management* (credenciales, login, sign out) y changelog |

## Lo que salió al implementarlo

- 🔴 **`/config/info` es PÚBLICO** (contesta 200 sin key): no sirve para saber si una sesión sigue valiendo. La
  caducidad se detecta en `/config/cluster`, que sí pide la key (403 con una revocada), tanto al leer el cluster
  como al recomprobarlo cuando se abre el selector.
- 🔴 **El `Select` de MUI no avisa al elegir la opción ya seleccionada**: el cluster en uso cuya sesión caduca no
  abría el login al volver a elegirlo. El diálogo se abre desde el `onClick` de la opción.
- El formulario del diálogo lleva `autocomplete` `off`/`new-password`: es el mismo dominio que este Kwirth y el
  navegador ofrecería sus credenciales, que no son las del remoto.
- **Del QA (disposición de Manage clusters):** el primer reparto metía textos de ayuda que cambiaban el tamaño
  del diálogo según la opción, y dejaba el selector varias filas por debajo de *API Key*. Queda: *Credentials*,
  el estado de la sesión y **SIGN OUT** en una fila, y *API Key* justo debajo. El selector se estrecha a 130 para
  que el estado (*Signs in on use*, *login required*, *as &lt;user&gt;*…) quepa sin cortarse. El e2e lo fija: alto
  del diálogo igual al cambiar a *Login*, SIGN OUT en la fila del selector, *API Key* debajo y el texto sin elipsis.
- Tipos que no estaban en el PLAN: `EClusterLoginOutcome` / `IClusterLoginOutcome` (resultado del login remoto),
  `EClusterLoginReason` (NO_SESSION / EXPIRED, por qué se abre el diálogo) y `loginExpired` en `Cluster` (solo en
  memoria, no se persiste).

## Fuera de esta versión

- Pestañas ya abiertas cuya key caduca: su canal falla como hoy con una key mala; la siguiente vez que se elija el
  cluster en el selector se pide el login (D5 es "al usarla"). Reabrir los canales vivos tras el login, si hace
  falta, en una iteración posterior.
- SSO del remoto (V2, D6). Cambio de contraseña del remoto (D4).
