# Filtro de IP en el login — PLAN

> **Estado:** streams validados (2026-11-12) · **L1 ✅** (`kwirth-common@0.5.81` → `0.5.82` con `enabled`) · **L2 ✅** · **L3 ✅** (QA del usuario completo, que cubre también L2) · **L4 ✅** · ✅ **CERRADO el 2026-11-12** · producto en [PRD.md](PRD.md).

## Estado verificado del código (2026-11-12)

- Settings del core: `back/src/api/SettingsApi.ts`, clave `kwirth.settings` (`SETTINGS_KEY`), ConfigMap con
  el JSON en `data.data`. PUT con merge y `onSettingsChanged`; `writeWithSecrets()` es la entrada del import
  (`ConfigBundleManager.ts:271` → `core.writeSettings`).
- Rutas que emiten accessKey: `LoginApi.ts:81` (`/login`), `LoginApi.ts:147` (`/login/password`),
  `AuthApi.ts:186` (callback del IdP). Signup anónimo en `AuthApi.ts:287` y `:303`.
- IP del cliente, cuatro copias de `(req as any).clientIp || x-forwarded-for || remoteAddress`
  (`LoginApi.ts:71,123,187`, `AuthApi.ts:264`) más la del WebSocket (`index.ts:3316`). `clientIp` no lo
  rellena nadie; `request-ip` es una dependencia sin uso.
- Front: `SettingsKwirth.tsx`, enum `ESettingsKwirthTab` (General, Notifications, Log, Marketplaces, Package
  registries). `Login.tsx:84` hace `switch (result.status)` y el 403 dice "Access has been denied.".
  `App.tsx:125` traduce `ESsoResult` a mensaje.
- Tests: `back/tests/api/{LoginApi,AuthApi,SettingsApi,Signup}.test.ts`, `back/tests/tools/configBundle.test.ts`,
  `loginRateLimiter.test.ts`; e2e `front/e2e/tests/kwirth-settings.spec.ts`.

## Streams

### L1 · Tipos en `kwirth-common` — ✅ cerrado (2026-11-12, `kwirth-common@0.5.81`)

> Back y front en `^0.5.81` (el front con `--legacy-peer-deps`: sin él npm reescribe peers en el lockfile).
> El `Record<ESsoResult, string>` de `App.tsx` obligó a adelantar aquí el mensaje de `IPNOTALLOWED`, que
> estaba en L3: sin él el front no compila.

- `ILoginIpFilter { allowed: string[], trustedProxies: string[] }` y `IKwirthSettings.loginIpFilter?`.
- `ELoginRefusal { IPNOTALLOWED = 'ipnotallowed' }` y `ILoginRefusal { refusal: ELoginRefusal }` (cuerpo del 403).
- `ESsoResult.IPNOTALLOWED = 'ipnotallowed'`.
- `ICallerAddress { ip: string, remoteAddress: string, forwardedIgnored: boolean }` (lo que muestra la pestaña).
- Publicar `kwirth-common` (externalizada: sin cascada), subir la dependencia en back y front.
- **Validación:** build de common, comprobar los exports con node y GET del registro después de publicar.

### L2 · Back — ✅ cerrado (2026-11-12)

> **Entregado.** `tools/ClientIp.ts` (resolución con proxies de confianza sobre `net.BlockList`) y
> `tools/LoginIpFilter.ts` (funciones puras; la lectura de settings la hacen las rutas con
> `SettingsApi.readStrict`, para que SettingsApi pueda usar la validación sin un ciclo de imports). Puerta en
> `/login`, `/login/password`, `/core/auth/:id/start`, `/core/auth/:id/callback`, `/core/auth/signup/info` y
> `/core/auth/signup`. Validación en el PUT y en el import (`IImportRequest.origin` → `writeSettings(data,
> origin)` → `writeWithSecrets(incoming, origin)`). `GET /core/settings/caller`. `request-ip` fuera.
>
> **Cambios sobre lo previsto:**
> - **`enabled`** (D9): pedido por el usuario a mitad del stream → `kwirth-common@0.5.82`.
> - **`/core/auth/signup` responde con su propio contrato** (`409 { result: ESsoResult.IPNOTALLOWED }`), no
>   con el 403 de RF3: el diálogo de signup ya convierte `ESsoResult` en mensaje. Y comprueba **antes** de
>   gastar el código, para que un rechazo no queme el código de quien puede reintentar desde la red buena.
>   `signup/info` sí da `403 ILoginRefusal`.
> - **El WebSocket no usa la función común.** Su IP solo sale en logs, y resolverla exigiría leer los
>   settings de forma asíncrona antes de registrar los listeners del socket (riesgo de perder mensajes). El
>   log ahora dice lo que sabe: la dirección de la conexión y, aparte, `X-Forwarded-For` tal cual. Antes
>   imprimía la entrada **izquierda** de la cabecera como si fuera el cliente.
> - **El import que trae un filtro inválido se para con 500** (el `catch` de `ConfigBundleApi`), antes de
>   aplicar nada: los settings son lo primero que se escribe.
> - **Falla cerrado** si los settings no se pueden leer (D10).
>
> **Tests:** `clientIp.test.ts` (18) y `loginIpFilter.test.ts` (15) nuevos; LoginApi +12, AuthApi +4,
> Signup +2, SettingsApi +10, configBundle +2. Suite del back: 951 tests, 947 ✔, 0 ✖, 4 skipped. En la
> primera corrida fallaron 3 de webhooks (`ENOTEMPTY` en `/tmp/kwirth-webhook-extract-<timestamp>`, dos
> ficheros chocando en paralelo) y pasaron en la segunda sin tocar nada: inestables, ajenos a esto.

- `tools/ClientIp.ts`: `clientAddressOf(remoteAddress, forwardedFor, trusted)` → `ICallerAddress`;
  normaliza `::ffff:a.b.c.d`; recorre `X-Forwarded-For` de derecha a izquierda saltando proxies de confianza;
  `buildBlockList(entries)` sobre `net.BlockList` (sin dependencias nuevas) y `invalidEntries(entries)`.
- `tools/LoginIpFilter.ts`: `isLoginAllowed(configMaps, req)`. Lee `kwirth.settings` en cada llamada (D7);
  lista vacía = permitido; loopback siempre permitido en desktop.
- Sustituir las cuatro copias + rateKey + WebSocket por la función común.
- Puerta en las seis rutas de RF2, antes del rate limiter, sin `fail()`.
- `SettingsApi`: validación de RF5 en PUT y en `writeWithSecrets(incoming, callerIp)`; el import pasa la IP
  de quien llama desde `ConfigBundleApi`. `GET /core/settings/caller` → `ICallerAddress` (scope `admin`).
- Retirar `request-ip` del `package.json`.
- **Validación:** tests unitarios — `ClientIp` (spoof sin proxy de confianza, cadena de proxies, IPv6,
  v4-mapped, entradas inválidas), `LoginApi`/`AuthApi`/`Signup` (403 y `ESsoResult.IPNOTALLOWED`, no cuenta
  para el rate limiter), `SettingsApi` (400 por formato y por dejarse fuera), `configBundle` (import
  rechazado). Harness completo en verde. Sin UI: el QA se hace en L3.

### L3 · Front — ✅ cerrado (2026-11-12, QA del usuario)

> **QA validado:** vista del tab, validación (entrada mal formada, encendido sin lista, lista que deja fuera
> a quien guarda), filtro activo con `Add localhost` + logout/login, y la vía de escape: con
> `allowed: ["192.0.2.0/24"]` el login dice "Login is not allowed from your IP address." y con
> `enabled: false` vuelve a entrar, **sin reiniciar el back** (CA2, CA5, CA6). Los cambios del ConfigMap
> de D los hizo Claude con `kubectl patch` sobre `data.data`, verificando cada uno con un POST a `/login`.
>
> La caída del back de dev durante el QA (nodemon vivo, sin proceso `ts-node`) **no fue de este cambio**:
> la causó otra sesión, con un error de tipos (lo confirmó el usuario).

> **Entregado.** Pestaña **Login access**: interruptor, recuadro "How Kwirth sees you" (dirección resuelta,
> la de la conexión y el estado de `X-Forwarded-For`) con el botón "Trust the proxy I'm coming through", y las
> dos listas en cajas de altura fija. Mensaje del rechazo en `Login.tsx` (login **y** cambio de contraseña,
> por el `ILoginRefusal` tipado) y en `SignupDialog.tsx` (un 403 de `signup/info` decía "código caducado").
>
> **Cambios sobre lo previsto:**
> - **El error de guardado ya no congela el diálogo.** Iba a `error`, que deshabilita todo (OK incluido):
>   un guardado rechazado no se podía corregir sin cerrar y perder lo editado. Con el filtro es el caso
>   normal ("te dejarías fuera"). Ahora es `saveError`, se muestra en la barra de acciones (un hueco que
>   siempre está, así que no mueve nada) y no deshabilita nada. Afecta a todos los guardados del diálogo.
> - **Contenido fijo medido en el navegador:** 460/460 px en los dos estados del recuadro (con y sin
>   cabecera ignorada). La primera versión medía 495 y partía el botón en dos líneas.
> - **Encendido con la lista vacía ya no se guarda** (QA del usuario, 2026-11-12): el PUT y el import lo
>   rechazan con "Add at least one allowed address to restrict login". En ejecución sigue dejando entrar a
>   todos (D9). +1 test en `loginIpFilter.test.ts` y +1 en `SettingsApi.test.ts`; suite del back 953/949 ✔.
> - **Botón "Add localhost"** (QA del usuario, 2026-11-12): añade `127.0.0.1` y `::1` a la vez. En el QA
>   el usuario añadió `127.0.0.1` y el back le dijo que no era su IP: el navegador llegaba por `::1`
>   (`localhost` resuelto a IPv6). El filtro no trata los loopback como equivalentes; el botón quita el
>   tropiezo sin cambiar esa regla. Deshabilitado cuando ya están los dos.
> - El botón propone /16 en IPv4 y /64 en IPv6; con un proxy en `::1` sale `0:0:0:0::/64` (correcto, sin
>   comprimir).
>
> **e2e:** 3 nuevos en `kwirth-settings.spec.ts` (sin guardar nada: el único guardado lo rechaza el back) y
> el caso `ipnotallowed` en `sso-result-messages.spec.ts`. Corridas: settings 5/5, sso 7/7, signup-ui y
> login-idp-password en verde. Una corrida del test del intervalo (previo) dio flaky con el front aún
> recompilando y pasó en el reintento; la siguiente, 5/5 a la primera.
>
> ⚠️ El primer e2e guarda el diálogo entero, así que el ConfigMap del dev ya lleva
> `loginIpFilter: { enabled: false, allowed: [], trustedProxies: [] }`. Inofensivo: es el estado apagado.

- Pestaña **Login access** (`ESettingsKwirthTab.LOGIN_ACCESS`): dos listas editables de filas de ancho fijo
  como Marketplaces, validación de formato en el cliente, recuadro "How Kwirth sees you" con
  `ICallerAddress` y aviso si `forwardedIgnored`, con un botón **"Trust the proxy I'm coming through"** que
  añade a `trustedProxies` la red de `remoteAddress` (/16 en IPv4, /64 en IPv6; el admin la ajusta) —
  validado con el usuario el 2026-11-12.
- `Login.tsx`: el 403 lee `ILoginRefusal` y muestra el mensaje del filtro.
- `App.tsx`: mensaje para `ESsoResult.IPNOTALLOWED`.
- **Validación:** e2e en `kwirth-settings.spec.ts` (pestaña visible, guardar una lista que **no** incluye al
  que llama da error, guardar con su IP funciona y el login sigue entrando; `afterAll` restaura solo lo
  leído). El 403 real no se provoca por e2e: el back no deja guardar una lista que deje fuera al que llama,
  así que lo cubren los tests de L2. Después, QA del usuario (incluye CA6 con `kubectl edit`).

### L4 · Documentación y cierre — ✅ cerrado (2026-11-12, en la CL9)

> **Guía** `guide/admin/02-initial-config`: sección *Login access* (qué cubre, cada parte de la pestaña, lo
> que no se deja guardar, proxies de confianza con el diagrama del ingress, el aviso del rate limiter, los
> tres casos de ingress-nginx con balanceador delante, la vía de escape con el comando literal, el fallo
> cerrado, el desktop y lo que ve quien entra) y enlace desde *kwirth settings*. tgz de docs regenerado y
> servido (GET 200 de la página y de la captura; render revisado en el visor).
>
> **Capturas:** nueva `admin-kwirth-settings-login-access.png`; recapturadas las cinco del diálogo
> (`admin-kwirth-settings`, `-notifications`, `-log`, `admin-marketplaces`, `admin-package-registries`)
> porque la fila de pestañas cambia, y `admin-kwirth-portability` (mismo spec). El spec vacía las listas
> en el formulario antes del ejemplo y cierra con Cancel: no guarda nada.
>
> 🔴 **La pestaña nueva rompió dos specs** que nadie había lanzado: `getByRole('tab', { name: 'Log' })`
> casa por substring con "**Log**in access" (`kwirth-log-settings.spec.ts` y el capture). Arreglados con
> `exact: true`. Después se pasaron **todos** los specs que abren *Kwirth settings* (9): 27 ✔, 3 ⏭ de
> siempre, 1 flaky (`help-popup`, arrancó en la pantalla de login con la sesión perdida; pasó al reintento).
> 📌 Lección: al añadir una pestaña, un menú o un botón, correr los e2e de **todo** el diálogo, no solo los
> de lo nuevo.
>
> **Changelog** 0.6.31 (dos entradas), **métricas** (`docs/qa/`, fila y los dos PNG).
>
> **Consumidores (punto 6):** revisados los que leen el export de portabilidad del core (tabla de contratos
> del índice privado). No les afecta: el campo nuevo de `core.settings` es opcional, y un import que
> restaura un bundle del **mismo** Kwirth lo hace un admin que ha entrado a través de ese filtro, así que
> pasa la validación. No necesita tarea.

- Guía de administración: la pestaña, los proxies de confianza (con el ejemplo del ingress), el aviso de §8
  y la vía de escape con el comando literal.
- Changelog, métricas de tests, índice de planes. Checklist de cierre CL9.
