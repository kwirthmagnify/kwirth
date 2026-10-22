# Auth hardening — hallazgos de la auditoría de seguridad

**Estado:** 🟡 **ABIERTO**. Los hallazgos de la auditoría original (A1–A8) están entregados y validados
(commit `cd62b4df`; harness 738 ✅ · typecheck limpio · `e2e:boot` 6/6 · k3d 4 escenarios). Lo que lo
mantiene abierto son **dos**: **A10** (la
dimensión `groups` filtra el menú y no la puerta) y **A12** (el core no exige scope al arrancar un canal
de cluster o autónomo — **decidido el 19: no lo va a exigir**; la puerta es del canal).

**A12, al día (2026-10-22)**: el contrato está escrito (`37264467`) y el **inventario hecho** (sección
propia más abajo). De 18 canales, **5 tienen puerta** y **13 declaran escalera y no la aplican**; `status`
tiene la suya **en el front**, que no es una puerta. 🔴 **Y la decisión quedó ratificada**: se propuso que
el core aplicara la escalera del canal y se rechazó — *la autorización es capa de negocio y la implementa
el canal; el core solo autentica*. Lo que queda, por tanto, **no es trabajo del core**: es una entrada por
canal, y cada uno la hace en su propio cierre.

**A13 cerrado el 20**: el helper bajó a `common` (`0.5.72`), con `scopeLevelOf` añadido y un **fail-open**
corregido de camino. ⛔ Las copias de `agora` y `excubitor` **no se tocan desde aquí**: son artefactos de
pago, cada uno con su repo y su cierre, y el helper ya está ahí para cuando se abran.

⛔ **A9 no se hace: la premisa no se reproduce** (medido en k3d el 20). Con el ingress de siempre
(`pathType: Prefix`), `/kwirth/` responde **302** y `/kwirth2` y `/kwirthXYZ` dan **404 de nginx**: este
controlador implementa `Prefix` **por segmentos**, como dice la spec. El cambio se llegó a escribir y se
**revirtió entero** antes de publicar nada. Última actualización: **2026-10-20**.
**Autor:** Julio
**Origen:** auditoría autorizada sobre instalación local (2026-10-08). Hallazgos verificados contra una
instancia dev real (`:3883`, arrancada con el `MASTERKEY` por defecto).
**Componentes:** `kwirth-back` (`index.ts`, `AuthorizationManagement`, `LoginApi`, `ConfigApi`),
`deploy/kubernetes/helm`, `deploy/kubernetes/manifests`.

---

## Por qué

Una auditoría de la superficie de autenticación del core encontró un fallo **crítico** que permite
suplantar al administrador sin credenciales en cualquier instalación dejada con el `masterKey` por
defecto, más varios hallazgos de endurecimiento. Este plan los traza hasta su cierre.

## Backlog

| # | severidad | qué | estado |
|---|---|---|---|
| A1 | 🔴 **CRÍTICO** | **`masterKey` por defecto `Kwirth4Ever`** ([`back/src/index.ts:230`](../../back/src/index.ts#L230)). La validación de bearer es `md5(masterKey\|resources\|expire) === id` ([`AuthorizationManagement.ts:73-78`](../../back/src/tools/AuthorizationManagement.ts#L73-L78)), sin estado en servidor. Con el default público, se forja una bearer `admin::::` offline y la instancia la acepta (**verificado**: `/user`, `/key`, `/core/scopes` → 200). Agravante: el mismo masterKey deriva la clave AES de los secretos at-rest ([`index.ts:491`](../../back/src/index.ts#L491), [`NodeSecrets.ts:18`](../../tools/NodeSecrets.ts#L18)). | ✅ **hecho** — exploit `Kwirth4Ever` forjado → **403** en k3d |
| A2 | 🔴 CRÍTICO (parte de A1) | **El core arranca en silencio con el default.** Quitar el literal `Kwirth4Ever` de código, values, docs y tests. La resolución de la masterKey queda definida en **§ Diseño A2** (abajo): `MASTERKEY` env → si no, auto-generar y persistir en el store. El chart de Helm lo lleva Julio por su lado (generación aleatoria por instalación / `existingSecret`). | ✅ **hecho** — `tools/MasterKey.ts`; manifests y tool externo sin default |
| A3 | 🟠 MEDIO | **`GET /config/info` sin autenticación** ([`ConfigApi.ts:19-28`](../../back/src/api/ConfigApi.ts#L19-L28)). Filtra pre-login versión, `clusterName`, **namespace** e inventario de canales (**verificado en vivo**). No exponer namespace/deployment/topología antes del login. | ✅ **hecho** — `isValidKey` + redacción anónima |
| A4 | 🟠 MEDIO | **WS: `RECONNECT` y `ROUTE` se procesan antes de validar el accessKey** ([`index.ts:1180-1216`](../../back/src/index.ts#L1180-L1216)); el WS principal no se autentica al conectar ([`index.ts:2939-2945`](../../back/src/index.ts#L2939-L2945)). Secuestro de stream posible **si se conoce/filtra un `instance` UUID v4** (122 bits, no forzable) de un canal `reconnectable`. Mover la validación de clave delante de esas acciones. | ✅ **hecho** (back+front) para RECONNECT. ROUTE se dejó: su `data` se re-despacha y se valida. ⚠️ follow-up: binding por-instancia |
| A5 | 🟠 MEDIO | **`POST /login/` sin rate-limiting real** ([`LoginApi.ts:43`](../../back/src/api/LoginApi.ts#L43)): solo hay un semáforo que **serializa**, no limita. Superficie de fuerza bruta de contraseñas. **Establecer un rate-limit** + lockout por usuario/IP. | ✅ **hecho** — `tools/LoginRateLimiter.ts` (5 fallos → 429) |
| A6 | 🟡 BAJO | **MD5 → HMAC-SHA256** en la firma de bearer keys + `crypto.timingSafeEqual` en vez de `===` ([`AuthorizationManagement.ts:77,87`](../../back/src/tools/AuthorizationManagement.ts#L77)). **Hardening, no urgencia**: con un masterKey fuerte y secreto el esquema aguanta (el length-extension no aplica porque `resources` va en el medio del mensaje firmado y la cola `expire` se valida como número). Importa para el mantenimiento: si algún día se reordenan los campos, el vector se abriría. Añadir revocación individual (`jti`). | ✅ **hecho** (breaking) — HMAC-SHA256 + `timingSafeEqual`. `jti`/revocación queda como follow-up |
| A7 | 🟡 BAJO | **Enumeración de inventario de extensiones sin auth**: `GET /core/<ext>/`, `/:id/front\|version\|schema\|config` de logins/plugins/providers/senders/themes/homepages/dces/docs devuelven listados y metadatos sin clave. `GET /core/logins/:id/config` **probado**: no filtra secretos en las extensiones instaladas (`anonymous`, `magnify`). Riesgo individual bajo, agregado medio (reconocimiento). Revisar caso por caso si alguna config pudiera contener secretos. | 📝 documentado, **sin cambio**: gatearlo rompería el login pre-auth (necesita listar logins/themes) |

| A8 | 🟠 MEDIO | **El canal WS se aceptaba en CUALQUIER ruta** ([`index.ts`](../../back/src/index.ts), `new WebSocketServer({ server })` sin `path`). La única criba era el ingress del cliente, y no lo controlamos: en un despliegue real, un `pathType: Prefix` sobre `/kwirth` dejaba pasar `/kwirth2`, `/kwirthXYZ` y `/kwirth<loquesea>` —nginx lo traduce a prefijo de **cadena**, no de segmentos— y el canal se abría por todas ellas. Comprobado: `GET /kwirth2` devolvía 404 y el **upgrade a WebSocket se aceptaba igual**. Cualquier regla de WAF, auditoría o autorización escrita contra la ruta exacta se esquiva pidiendo otra. | ✅ **hecho** (2026-10-09) — `tools/WsPathGuard.ts` + `wsServer.shouldHandle`: se acepta la ruta propia y sus subrutas **por segmentos**, se rechaza el resto con traza. Sin `ROOTPATH` no se filtra, que es el caso del ingress con `rewrite-target`. +6 tests |
| A9 | 🟡 BAJO | **Los manifiestos de despliegue declaran `pathType: Prefix`** y con nginx eso NO casa por segmentos (es lo que destapó A8). Afecta a cuatro: el **chart** (`helm/kwirth/templates/ingress.yaml`), `manifests/service-and-ingress.yaml`, `test/service-and-ingress-develop.yaml` y el ejemplo comentado de `manifests/kwirth-full-ro.yaml`. Con A8 ya no es un agujero, pero siguen declarando una cosa y haciendo otra. ⚠️ **El chart es multi-controlador**: `use-regex` es una anotación **de nginx** y no vale para AGIC ni Traefik, así que el cambio hay que condicionarlo a la clase de ingress — no es sustituir una línea. | ⛔ **NO SE HACE — la premisa no se reproduce** (verificado en k3d el 2026-10-20). Se implementó el regex condicionado por controlador y, antes de publicarlo, se midió contra el cluster: con el ingress **viejo** desplegado (`/kwirth`, `pathType: Prefix`, sin `use-regex`), `curl /kwirth/` → **302** y `curl /kwirth2` y `/kwirthXYZ` → **404 generado por nginx**. Es decir, **este ingress-nginx SÍ implementa `Prefix` por segmentos**, como manda la spec: `/kwirth2` no entra. El cambio sustituía algo correcto y portable (`Prefix`) por `ImplementationSpecific` + un regex atado a una anotación de nginx, para arreglar lo que no está roto — y dejaba AGIC y Traefik por otro camino. **Revertido entero** (chart, los dos manifiestos y el ejemplo comentado). 🔴 **Y la lección es sobre este plan, no sobre el chart**: A9 daba la premisa por verificada (*«es lo que destapó A8»*) y se codeó sin contrastarla; dos `curl` habrían bastado antes de tocar nada. Lo que A8 observó no se reproduce con este controlador —pudo ser otra versión u otro montaje—, y su defensa real, `WsPathGuard` en el core, **no depende de qué ingress haya delante**, que es justo lo que la hace buena |

| A10 | 🟠 MEDIO | **La dimensión `groups` del recurso filtra el MENÚ, no la PUERTA** (detectado el 2026-10-17). El editor de seguridad **sí** la escribe ([`ResourceEditor.tsx:81`](../../front/src/components/security/ResourceEditor.tsx#L81)) y el core **sí** la evalúa al **listar** controladores ([`AuthorizationManagement.ts:362`](../../back/src/tools/AuthorizationManagement.ts#L362), `getAllowedControllers`), pero en el camino de autorización **no se lee nunca**: `checkResource` tiene un **`//+++` vacío** donde iría ([`:249`](../../back/src/tools/AuthorizationManagement.ts#L249)), y `getAllowedPods` filtra por `namespaces` y `pods` de la clave y por el controlador **pedido** — que `getValidPods` le pasa **vacío**. Consecuencia: un `view:produccion:replica+rs1::` restringe el desplegable del front y **no restringe el acceso**; quien no use el desplegable (un `instanceConfig` compuesto a mano, o una API key usada directamente) ve toda `produccion`. El administrador cree haber acotado y no ha acotado. ⚠️ **Verificado leyendo el código, NO explotado.** 🔴 **Y el arreglo es un endurecimiento con víctimas**: hoy esas concesiones funcionan más anchas de lo que dicen, así que evaluarlas **quita acceso que la gente usa**, en silencio. Si se arregla, va como ruptura anunciada, no como mejora. ⚠️ Y la decisión es **del core**: si lo arregla un solo canal (salió al diseñar el matcher de [fileman-target](../fileman-target/PLAN.md)), ese canal queda más estricto que el resto con la misma clave, que es el peor de los tres escenarios. | ⬜ pendiente, **no se aborda ahora** (2026-10-17) |

### Hallazgos del 2026-10-17/19 — el canal que no mira su clave

Los tres salieron de implementar [thin-scopes](../completed/thin-scopes/PLAN.md) y el primer canal que lo
usa. Comparten causa: **el core no autoriza por el canal**, y el canal no siempre lo sabe.

| # | sev | hallazgo | estado |
|---|---|---|---|
| A11 | 🟠 MEDIO | **`trivy$kubernetes` se concede y no acota nada** (2026-10-17). El scope se declara, aparece en el editor y un administrador lo concede creyendo que separa los informes *cluster-scoped* (RBAC, infra assessment) de los de workload. Pero en todo el back del canal **solo aparece en la escalera** (`getChannelScopeLevel`): ninguna ruta lo comprueba, así que un `trivy$user` ve exactamente lo mismo. Es el patrón de siempre —*un permiso que se concede y no hace nada*— y aquí los datos son informes de vulnerabilidades y **secretos detectados**. El arreglo es el de magnify: decidir por tipo de informe, no por comando. | ✅ **hecho** en `plugin/trivy@0.2.32` (2026-10-19) — ⚠️ **el arreglo no fue el previsto**: al mirarlo de cerca, el canal **nunca pide** los informes *cluster-scoped* (su lista son los cuatro namespaced), así que no había nada que separar por tipo. El scope se **elimina**, y lo que acota pasa a ser lo mismo que en el resto: los **recursos** de la clave (`keyMatchesResource` sobre el namespace, lo primero de `matchesScope`). ⚠️ Y destapó algo mayor que lo apuntado: hasta 0.2.31 **solo se filtraba lo que la pantalla pedía**, no lo que la clave alcanzaba — abrir Trivy en vista de cluster entregaba los informes de todos los namespaces. Ruptura anunciada en la guía y en el README |
| A12 | 🔴 **ALTO** | 🔴 **El core no comprueba NINGÚN scope al arrancar un canal autónomo o de cluster** (2026-10-18). Sus dos ramas de arranque —`!cluster && !resourced` y `cluster && view===CLUSTER`— no miran la clave: `checkAkr` se llama **solo** desde `addObject` de los canales *resourced*. Para los demás, quien llegue al canal entra. Magnify era la prueba: no leía su accessKey en absoluto y **cualquier clave veía el cluster entero**; se arregló en `plugin/magnify@0.2.0` poniéndole puerta propia, como ya hacían agora, excubitor y trivy. 🔴 **DECIDIDO (2026-10-19, Julio): el core NO va a exigir nada.** *«Si un canal no pide scopes, el core no se los va a inventar. El mínimo es estar logado y no tener scope.»* Se descarta la salida de que el core imponga un `<canal>$user` cuando el canal declare catálogo: el core no puede inventar una semántica de permisos que el canal no ha declarado, y hacerlo sería además una ruptura para todo canal que hoy se arranca con una clave sin scopes **a propósito**. **El mínimo del core es y seguirá siendo una clave válida.** Esto no cierra el hallazgo, lo **reubica**: la puerta es del canal, así que lo que queda no es código del core sino (a) **decirlo en el contrato** —`IChannel`/la guía de extensiones— para que quien escriba un canal sepa que el core le va a entregar a cualquiera que esté logado, y (b) el **inventario**: qué canales de cluster o autónomos manejan datos que merecen puerta y no la tienen. Magnify era la prueba (no leía su accessKey y cualquier clave veía el cluster entero; arreglado en `plugin/magnify@0.2.0`), y Trivy la segunda (`0.2.30`). | 🟡 **decisión tomada**, **contrato escrito** (`37264467`) e **inventario hecho** (2026-10-22, sección propia más abajo): 5 canales con puerta, **13 sin ella** y `status` con la suya en el front. Lo que queda es trabajo **de cada canal**, no del core |
| A13 | 🟡 BAJO | **La UI ofrece lo que la puerta rechaza.** Tres casos encontrados el mismo día: el overview de cluster de magnify sincronizaba **todos** los plugins instalados con `permission: true` escrito a mano; sus acciones (`create`, `delete`, `edit`…) se pintaban sin mirar permiso; y la sección *Extensions* de sus preferencias abría gestores del core a cualquiera. Los tres arreglados en `magnify@0.2.0`/`0.3.0`. ⚠️ **Lo que sí era transversal**: ninguna extensión tenía forma barata de preguntar —`scopeAllows` vivía en `common-back`, donde el front no llega, y magnify tuvo que escribirse su propia copia en `src/common/`—. **Si un segundo canal la copia, el helper debe bajar a `common`.** 🔴 **CORRECCIÓN (2026-10-20)**: este hallazgo decía además que *«`permission: true` a fuego es la forma por defecto de declarar un item»*, y **eso no es de Kwirth**. `permission` es un campo de `ISpaceMenuItem` de **`@jfvilas/react-file-manager`**, la librería de terceros sobre la que magnify monta su árbol; va **siempre a `true`** y no es un mecanismo de autorización. Todos sus usos del repo están en un único fichero (`magnify/src/front/components/RFMConfig.tsx`) y ninguna otra extensión lo toca — y en esa librería ni siquiera hace nada en los items personalizados: lo que lee es `isVisible()`, que es con lo que se acabaron gateando las acciones. La frase describía un riesgo que no existe fuera de ahí. | ✅ **CERRADO** (2026-10-20). El helper bajó a `common`, `common@0.5.72` + `common-back@0.6.9`): `scopeAllows`, `keyAllows` y, nuevo, **`scopeLevelOf`** —el nivel y no un sí/no, que es lo que necesita excubitor y lo que habría hecho que se copiara otra vez—. `common-back` los **re-exporta** para no romper a fileman, trivy, excubitor ni a nada de terceros compilado contra 0.6.x. 🔴 **Y al escribir sus tests salió un fail-OPEN que llevaba ahí desde el principio**: `levelOf` devuelve -1 para lo que no conoce, así que pedir un scope **fuera de la escalera** daba `requiredLevel = -1`, que alcanzaba **cualquier** scope — un canal pidiendo `'fileman$writte'` mal escrito abría la puerta a todas las claves. Hoy falla cerrado. No se explotaba: los tres que llaman piden siempre scopes de su propia escalera. ⚠️ **Y el inventario del hallazgo estaba mal**: no eran «tres copias en el back». Las copias que importan están en `common`/front, porque el front no alcanza `common-back`, y son **cuatro**: trivy (eliminada hoy al mudar el botón al provider), **status** (migrada, era `scopes.includes('admin')`), **agora** (de pago, copia literal) y **excubitor** (de pago, `maxExcubitorScopeLevel` → ahora `scopeLevelOf`). 🔴 **Magnify, al que este hallazgo nombraba, NO es una copia**: su `grantsOf` combina nivel **por resource**, namespaces y kinds ocultos de los thin scopes con reglas de intersección propias. Es un modelo, no el helper duplicado, y se queda como está. ⛔ **Las dos de pago NO se tocan desde aquí** (decisión de Julio, 2026-10-20): cada una es su propio artefacto, con su ciclo y su cierre, y retirar su copia es trabajo de ese repo cuando se abra — el helper ya está disponible para cuando toque. *(Antes: ⬜ pendiente — 🔴 **la condición se cumplió** el 2026-10-19: `trivy@0.2.32` necesitaba deshabilitar **Manage** sin `admin` y escribió su **tercera** copia de la escalera (`keyReaches`, en `src/common/TrivyTypes.ts`), porque importar `scopeAllows` de `common-back` desde el front no compila. ℹ️ **Esa copia ya no existe** (2026-10-20): al mudar la gestión del operador al provider (`plugin/trivy@0.3.0`), el front del canal dejó de hacer preguntas de permisos y la copia se fue con el botón. **No cierra el hallazgo** —la de magnify sigue ahí y el siguiente canal que necesite preguntar volverá a escribirla—, pero enseña la salida barata: cuando el permiso que decide una UI es de OTRA extensión, mover la función evita la copia mejor que compartir el helper.)* |

## A12 — el inventario (2026-10-22)

Lo que quedaba de A12 era esto: **qué canales entran por una rama sin puerta y no se ponen la suya**.

🔴 **Y la decisión de arquitectura queda ratificada y ampliada** (Julio, 2026-10-22), porque se volvió a
proponer lo contrario y se rechazó: *«quien tiene que implementarlo es el canal, porque es un tema de
autorización, no de autenticación, y la autorización va a la capa de negocio, no es técnica»*. Se propuso
que el core aplicara la escalera del canal (`getChannelScopeLevel`, que ya expone) para cubrir de golpe a
los trece de abajo. **No se hace.** El core autentica y entrega la capacidad técnica; qué se sirve con
ella es negocio, y el negocio lo conoce el canal.

**Las tres ramas de arranque** (`back/src/index.ts`, `processStartInstanceConfig`):

| rama | condición | qué entrega | ¿valida? |
|---|---|---|---|
| autónoma | `!cluster && !resourced` | `addObject(ws, cfg, '', '', '')` — selectores vacíos | no, y **no debe**: no mira un solo pod |
| **cluster** | `cluster && view===CLUSTER` | `addObject(ws, cfg, '*all','*all','*all')` | **no** — solo un `logWarning` |
| resourced | el resto | pods validados | **sí**: `getRequestedValidatedScopedPods` deniega si no hay match |

La paradoja que explica el hallazgo: las vistas **estrechas** (namespace, grupo, pod) se filtran recurso a
recurso, y la **más amplia** no mira nada. Y entre la validación de la clave y esa rama no hay más que
`enabledChannels`, que es opcional y por usuario.

**Inventario (18 canales).** Los 18 **declaran** su escalera (`getChannelScopeLevel`): es parte del
contrato. Solo **cinco** la comprueban en su back:

| | canales |
|---|---|
| ✅ **con puerta propia** | `agora` (`hasScopeLevelInResources`), `magnify` (`MagnifyAuth`, importado por el back), `excubitor` (`keyAllows`), `trivy`, `fileman` |
| ⬜ **declaran escalera y no la aplican** | `censor`, `iter`, `mirc`, `montag`, `nettools`, `news`, `pinocchio`, `provider-debug`, `sender-debug`, `situs`, `spectrum`, `topology` |
| ✅ cerrados desde el inventario | `status` (`0.8.0`, 2026-10-22 — ver abajo) |

De los trece, los que enseñan datos del cluster son los que corren prisa: **`montag`** y **`censor`**
(log, filtrado o censurado, pero log), **`pinocchio`** (eventos + LLM), **`topology`** y **`nettools`**
(forma y red del cluster). Los demás (`mirc`, `news`, `situs`, `spectrum`, los dos `*-debug`) exponen lo
suyo, no el cluster.

### ✅ `status` — cerrado el 2026-10-22 (`plugin/status@0.8.0`)

El primero de los trece, y de camino **dos correcciones a este mismo inventario**, las dos mías:

- **No es autónomo**: es `cluster: true`. Lo leí mal de un comentario que hablaba de las `sources`
  (`EClusterType.NONE`, o sea que funciona sin Kubernetes), no del campo `cluster`.
- **Su log NO estaba desprotegido.** Dije que la puerta estaba en el front y es falso: la sirve el core,
  `/managekwirth/log` y `/previouslog` exigen `hasScope(req,'admin')` y responden **403**. El `isAdmin`
  de `front/StatusLog.ts` es **UX** —no pedir lo que va a ser rechazado—, que es justo lo que A13 pide.

**El agujero real era el inventario**, no el log: enumera todas las extensiones montadas con su estado,
las rutas HTTP publicadas y el pool SQL — el mapa de la instalación — y lo veía cualquiera que estuviese
logado. El canal ya decía en el comentario de `getChannelScopeLevel` que su mínimo es `cluster`; ahora lo
**comprueba** (`keyAllows` con su propia escalera), con 6 tests.

🔴 **Y el QA manual encontró dos fallos encadenados que el harness no ve** (y el segundo no era del
cambio): el rechazo se mandaba como `START`+`RESPONSE`, y el front marca `started` con esa pareja **sin
mirar el nivel**, dejando la pestaña en *"the channel is running; the inventory should appear in a
moment"* para siempre; y el motivo, aunque llegaba a `data.signals`, **solo se pintaba dentro del render
que necesita inventario**, así que cualquier error anterior al primer snapshot era invisible por
construcción. Los dos arreglados.

⚠️ **Queda vivo, y es del core**: `addObject` devuelve `false` al denegar y **el core lo descarta** (uno
de los cinco sitios donde no mira el retorno). El usuario ve el error, pero la instancia se queda
registrada y el websocket abierto.

⚠️ **Lo que hoy no existe y haría falta si algún día se quisiera genérico**: el canal no tiene forma de
declarar su **mínimo**. `BackChannelData` tiene `cluster`, `resourced`, `routable`… pero ningún
`minScope`; `getChannelScopeLevel` da el **orden** de la escalera, no el mínimo exigido. Añadirlo sería
cambio de contrato en `common-back` y recompilar todos los plugins — y, por la decisión de arriba, no es
el camino.

> ✅ **El agujero de [fileman-target](../completed/fileman-target/PLAN.md) está cerrado** desde
> `fileman@0.2.29` (2026-10-19): el verbo estaba resuelto desde `0.2.27`, el **objetivo** lo está ahora.
> Se verificó explotándolo en dev el 2026-10-17 y re-ejecutando el mismo exploit tras el arreglo: la
> clave y la ruta del ataque responden **403**, y el control positivo sigue devolviendo el fichero.

## Diseño A2 — resolución de la masterKey (cerrado 2026-10-08)

**Regla:** la masterKey se resuelve **antes** de construir `NodeSecrets` (que la recibe en
[`index.ts:491`](../../back/src/index.ts#L491)), en este orden:

1. Si `process.env.MASTERKEY` está definido → se usa (comportamiento explícito, sin cambios).
2. Si no → se lee del store **plano** (`configMaps`, clave p. ej. `.masterkey`).
3. Si tampoco existe → se genera con `crypto.randomBytes(32)`, se **persiste en `configMaps`** y se usa.

**Por qué `configMaps` y no `secrets`:** `NodeSecrets` cifra *con la propia masterKey* → guardarla ahí
sería huevo-y-gallina. El store plano (`configMaps`) no la necesita. Es el **mismo patrón ya existente**
de la identidad de instalación ("se genera una vez y se guarda en el store, nunca se configura",
[`index.ts:520-535`](../../back/src/index.ts#L520-L535)) — se reutiliza. Requiere construir `configMaps`
antes que `secrets` en el switch de [`index.ts:488-508`](../../back/src/index.ts#L488-L508).

**El eje real es la durabilidad del store, NO si el despliegue es read-only.** `RO ⟹ KWIRTH_STORE ⟹
store FILE sobre PVC ⟹ persistir es escribir un fichero en el PVC, no una llamada al API de Kubernetes`
(cero verbos de escritura). Y "store KUBERNETES sin permiso de escritura" no existe: ese store no
arranca sin escrituras, así que nunca coincide con RO. Matriz (`MASTERKEY` unset):

| store | durabilidad | resultado |
|---|---|---|
| FILE con PVC/volumen (incl. el manifiesto RO) | durable | ✅ genera y persiste en el volumen; estable entre reinicios; **sin escrituras al cluster** |
| KUBERNETES (no-RO, con escrituras) | durable | ✅ aquí la masterKey **solo firma bearers** (los Secret son reales); persistir el ConfigMap funciona porque hay escrituras |
| FILE con path efímero (serverless sin `KWIRTH_STORE`, `emptyDir`) | efímero | ⚠️ rota en cada reinicio → invalida las API keys emitidas. Pero ahí **todo el store cifrado ya es efímero**; no es específico de la masterKey. **Warn** una vez |

### Dos tiers, y qué protege cada uno

Son **dos amenazas distintas**, y el auto-generado solo cierra una:

| | atacante que **forja** una bearer admin (A1) | atacante que **tiene el volumen** (at-rest) |
|---|---|---|
| hoy, `Kwirth4Ever` | ✅ sin nada (clave pública) | ✅ descifra (clave pública) |
| **Tier 1** — clave auto-generada en el store | ❌ ya no (no la conoce, no tiene el store) | ✅ sigue descifrando (clave al lado) |
| **Tier 2** — `MASTERKEY` externo (Secret→env, fuera del volumen) | ❌ | ❌ (la clave no está en el volumen) |

- **Tier 1 (default, cero config):** **cierra A1 del todo** — quien forja no tiene el PVC, solo sabía el
  default público. El cifrado del store es **ofuscación, no confidencialidad**: la clave vive en claro en
  el mismo volumen que el cifrado (`configMaps` plano). Es inherente — no se arranca cifrado at-rest de un
  volumen con una clave que vive en ese mismo volumen. `Kwirth4Ever` tampoco lo daba, lo daba peor.
- **Tier 2 (recomendado para proteger el volumen):** `MASTERKEY` inyectado por env desde fuera del store
  (Secret de K8s, KMS) → cifrado at-rest **real** + firma de bearers secreta.

### Reinicio del core: clave y secretos comparten destino

La masterKey (en `configMaps`) y los secretos cifrados (en `NodeSecrets`) viven en el **mismo `storePath`
→ mismo volumen**, así que **no pueden desincronizarse**. Elimina estructuralmente la pesadilla de
"secretos cifrados huérfanos de su clave":

- **FILE con PVC** (Tier 1 real): reinicio → `resolveMasterKey` entra por el paso 2, **relee la misma
  clave**, no regenera; store descifra, API keys intactas. ✅
- **FILE efímero**: se pierden clave **y** secretos a la vez → clave nueva + store vacío, consistente;
  solo se pierden las API keys (re-login). No es un fallo nuevo.
- ⚠️ **FILE_PLAIN (docker legacy)**: `configMaps` y `secrets` pueden apuntar a paths distintos
  (`CONFIGMAPPATH` ≠ `SECRETPATH`). Si uno es durable y el otro no, podrían desincronizarse → en ese caso
  **exigir `MASTERKEY` explícito** en vez de auto-generar. En FILE y KUBERNETES no aplica.

**Warn obligatorio** al auto-generar (dice la verdad, no vende cifrado que no da):
> *"MASTERKEY not set: generated and stored. This stops credential forgery, but since the key lives next
> to the encrypted store, at-rest encryption is not effective against anyone who can read the volume. For
> real at-rest protection, provide MASTERKEY from outside the store (e.g. a Kubernetes Secret)."*

No se aborta (salvo el FILE_PLAIN con paths dispares): generar es mejor default que `Kwirth4Ever`.

**Tests que cubre el stream:** forja con `Kwirth4Ever` **rechazada** cuando el core auto-genera; masterKey
generada **persiste y se relee** en store FILE (misma entre dos arranques); env `MASTERKEY` tiene
prioridad sobre la persistida; warn emitido cuando el store no es durable.

## Notas de método

- No existe `metricsNoToken.test.ts`; la ruta de métricas del provider **sí** valida clave.
- El scope `cluster` **no** satisface los endpoints admin-gated (chequean el literal `admin`): el
  atacante forja `admin` directamente, así que no es defensa; es una inconsistencia latente de
  autorización que conviene unificar.
- Toda la verificación fue de **solo lectura**: se confirmó el `200` sin extraer datos sensibles.
