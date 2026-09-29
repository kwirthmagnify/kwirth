# DCE — dynamic core extension — PRD

> Estado: **VIVO** (2026-09-28) · **revisado y sin puntos abiertos** (2026-09-29). Documento de **producto**:
> qué problema resuelve y por qué así. El desglose en fases y streams va al [PLAN](./PLAN.md).
> Si algo de aquí contradice lo que ves en el producto, gana el producto.

## 1. El problema

Hay código que **varias extensiones necesitan y que no pertenece al core**. El ejemplo que lo destapó
son los iconos de IRIA: los usan varios plugins de la suite, pero son de pago y el core es open source,
así que no pueden vivir en `common-front`. Hoy cada extensión que los necesita los **bundlea**, con
tres consecuencias:

1. **N copias del mismo código** en el navegador y en el proceso del back, una por consumidor.
2. **N instancias** de lo que debería ser una sola: cada bundle instancia lo suyo, y un objeto que
   debería compartirse —un cliente, una caché, un registro— no se comparte.
3. Una versión nueva del código común obliga a **republicar todos los consumidores**.

El core ya tiene el mecanismo que resuelve esto para sus propias librerías: publica
`global.__kwirth_back__` en el back ([back/src/index.ts:121](../../../back/src/index.ts#L121)) y
`window.__kwirth__` en el front ([front/src/index.tsx:69](../../../front/src/index.tsx#L69)), y el
plugin de esbuild de cada extensión resuelve `@kwirthmagnify/kwirth-common*` contra esos globales en
vez de bundlearlo. **Pero solo el core puede poblar esos espacios.** Un tercero no tiene forma de
colgar nada ahí.

## 2. Objetivo

**Un tipo de extensión que aporta objetos instanciados, que el core cuelga de un global, y que otras
extensiones consumen por id.** No aporta datos ni pantallas: aporta código y objetos.

La regla de reparto respecto a lo que ya existe:

| si la extensión… | es un… |
|---|---|
| produce **datos** (eventos, métricas, recursos) | provider, consumido vía handle y suscripción |
| produce **UI** que el usuario abre | plugin (canal) |
| produce **código u objetos** que otras extensiones invocan | **DCE** |

### No objetivos

- **No sustituye a los providers.** Un provider tiene ciclo de vida, suscriptores y un camino del dato.
  Una DCE es un objeto en un registro. Si algo emite, es provider.
- **No tiene configuración en V1.** Sin diálogo, sin `configRouter`, sin secretos propios. Solo código
  y objetos (decisión del usuario, 2026-09-28).
- **No hay dependencias entre DCE en V1.** Una DCE no consume otra DCE. Queda para V2 (decisión del
  usuario, 2026-09-28).
- **No es un mecanismo de plugins de terceros para el navegador.** Solo lo cargan extensiones de
  Kwirth, con el mismo tgz y el mismo flujo de instalación que todas.

## 3. Quién lo usa

| # | Perfil | Qué quiere |
|---|---|---|
| CU1 | Quien mantiene una **suite** de extensiones (IRIA) | Un sitio para lo común de la suite que no sea el core, y publicarlo una vez |
| CU2 | Quien escribe una extensión que necesita un **objeto compartido** (un cliente, un registro, una caché) | Pedirlo por id y recibir **la misma instancia** que todos los demás |
| CU3 | Quien escribe una extensión **de pago** con código que no puede ir al repo público | Un artefacto privado que se instala como cualquier otro: Nexus y manifest privado |
| CU4 | Quien opera Kwirth | Ver qué DCE hay instaladas, quién las usa, y no poder romper un consumidor desinstalando lo que usa |

## 4. Concepto

```
   +-----------------------+        +-----------------------+
   |  DCE  iria-icons      |        |  DCE  <otra>          |
   |  back.js  ·  front.js |        |  back.js  ·  front.js |
   +-----------+-----------+        +-----------+-----------+
               | create(host)                   | create(host)
               v                                v
   +-----------+--------------------------------+-----------+
   |  registro del core                                     |
   |  global.__kwirth_dce__[id]    window.__kwirth_dce__[id]|
   +-----------+--------------------------------+-----------+
               | getDce<T>(id)                  | getDce<T>(id)
               v                                v
   +-----------------------+        +-----------------------+
   |  plugin Excubitor     |        |  provider <otro>      |
   +-----------------------+        +-----------------------+
```

Tres piezas:

1. **La DCE exporta una fábrica, no un módulo.** Cada lado (back y front, cada uno opcional) exporta
   un `create(host)` que el core llama **una sola vez** al cargar la DCE. Lo que devuelve es lo que se
   guarda en el registro. Así lo compartido es la **instancia**, no el código.

   ```ts
   // back.js
   export interface IDceBack<T> {
       create(host: IDceBackHost): T | Promise<T>
   }
   // front.js
   export interface IDceFront<T> {
       create(kwirth: typeof window.__kwirth__): T
   }
   ```

2. **El core lo cuelga del registro** en `global.__kwirth_dce__[id]` y `window.__kwirth_dce__[id]`,
   junto a los espacios que ya existen para los demás tipos.

3. **El consumidor lo pide por id**, con un accesor tipado en `common-back` y `common-front`:
   `getDce<T>(id)`. Si la DCE no está cargada, **lanza**. No devuelve `undefined`: un valor vacío sin
   error en el log es exactamente el síntoma que más ha costado diagnosticar en este proyecto.

### Lo que recibe `create` en el back (decisión del usuario, 2026-09-28: sí a todo)

| campo | para qué |
|---|---|
| `logger` | trazas con el componente de la DCE |
| las libs de `__kwirth_back__` | common, common-back, common-ai, common-sql, express |
| `configMaps` | persistir lo suyo, con prefijo `kwirth-dce-<id>-` |
| `secrets` | una DCE que instancie un cliente con credenciales necesita leerlas |

### Cómo bundlea el consumidor

El plugin de esbuild que hoy resuelve `@kwirthmagnify/kwirth-common*` contra `__kwirth_back__`
([plugins/agora/build.mjs:30](../../../plugins/agora/build.mjs#L30)) se generaliza: recibe un mapa de
**paquete npm → entrada del registro**. El consumidor instala el paquete de la DCE solo por sus
**tipos**, y en runtime la importación se resuelve contra `__kwirth_dce__['<id>']`. Es el mismo
patrón que ya evita los 15 MB de `client-node` en cada plugin, aplicado a código de terceros.

## 5. Requisitos

### Funcionales

| # | Requisito |
|---|---|
| RF1 | Nuevo valor `DCE = 'dce'` en `EExtensionType`; manager, API, descriptor de front, clave en manifest y en licencia, y soporte en packs. Es el manager **número doce**: auditoría por script antes de tocar |
| RF2 | Instalar, actualizar y desinstalar una DCE desde el diálogo de extensiones, desde marketplace y desde tgz local, igual que el resto |
| RF3 | Al cargar una DCE, el core llama a `create()` de cada lado una sola vez y guarda el resultado en el registro |
| RF4 | `getDce<T>(id)` en `common-back` y `common-front`; lanza con mensaje claro si la DCE no está |
| RF5 | El consumidor declara sus DCE en su `package.json` con el mecanismo que **ya existe** para toda extensión: `requiresExtension: ["dce:<id>:<versión mínima>"]`. Sin clave nueva (D9, ajustado desde el PLAN) |
| RF6 | **Orden de carga en el back**: todas las DCE se cargan **antes** que cualquier otro manager que evalúe código de extensiones |
| RF7 | **Orden de carga en el front**: antes de añadir el `<script>` de un consumidor, el core carga y **espera** las DCE que ese consumidor declara. Aplica a los **cuatro cargadores** que corren tras el login, cuando `window.__kwirth__` ya existe: plugins (`loadPluginFront`), diálogos de configuración de providers, senders y webhooks (`ConfigFrontDialog`), themes (`loadThemeFront`) y homepages (`loadHomepageFront`). Los **logins** no pueden consumir una DCE: renderizan antes que el front y con su propio renderer, al que ya sabemos que ni los themes llegan. Los **idps** no tienen front que cargar |
| RF8 | Instalar un consumidor cuyas DCE no están, o no satisfacen el rango, **se rechaza** con un error visible en la UI que diga qué falta |
| RF9 | Desinstalar una DCE con consumidores instalados **se bloquea** y la UI dice quiénes son. Es el patrón `usedBy` de las cuentas cloud |
| RF10 | Kwirth Status lista las DCE con su versión y sus consumidores, como al resto de extensiones. **Depende** del S3 de [Status v2](../../kwirth-status/PLAN-v2.md), donde el core expone las extensiones a los canales: se hace cuando aquel llegue, sin prisa, y no bloquea el cierre de este plan |
| RF11 | **Actualizar** una DCE **cambiando de major** (1.x → 2.0) cuando algún consumidor instalado exige un major inferior **se rechaza**, igual que RF9 y con la lista de quién lo impide. La dependencia es versión mínima, así que "salir del rango" solo puede significar romper por major (D10, ajustado desde el PLAN). Sin esto, RF8 valdría solo el día de la instalación |
| RF12 | En un **pack**, las DCE se instalan **antes** que el resto de sus miembros. Si no, un pack con una DCE y sus consumidores chocaría con RF8 por orden de llegada |

### No funcionales

| # | Requisito |
|---|---|
| RNF1 | El tipo es del **core**, público y open source. Las DCE de pago van al Nexus privado y al manifest privado, scope `@iriaoperae`, y sus planes al índice privado |
| RNF2 | Una DCE cuyo `create()` reviente **no tumba el core**: se marca fallida, se loguea, y sus consumidores fallan en `getDce()` con la causa |
| RNF3 | Actualizar una DCE en el back exige **reinicio** (`requiresRestart: true` obligatorio en V1): los consumidores conservan referencias a la instancia vieja y no hay forma segura de sustituirla en caliente |
| RNF4 | Actualizar una DCE en el front exige **recarga de página**, por el mismo motivo |
| RNF5 | Todo el código, logs, UI y comentarios en inglés |

## 6. Riesgos

| # | Riesgo | Cómo se trata |
|---|---|---|
| R1 | **Carrera en el front**: un plugin ya abierto se recarga (`loadPluginFront`) y su DCE aún no está | RF7: la carga del consumidor espera a sus DCE **siempre**, no solo en el arranque |
| R2 | Un consumidor bundlea la DCE **por error** en vez de resolverla al global, y hay dos instancias sin que nadie lo note | El plugin de build compartido resuelve por nombre de paquete; la guía lo dice y el e2e comprueba que la instancia del consumidor `===` la del registro |
| R3 | Sin restricción de acceso: **cualquier** extensión puede pedir cualquier DCE | Aceptado en V1. Una DCE de pago se protege por la licencia de su **instalación**, no por quién la llama |
| R4 | Semver a mano en dos sitios (versión de la DCE, rango del consumidor) | La comprobación la hace el core en la instalación (RF8), no el consumidor en runtime |
| R5 | Hot-install de una DCE en el back: RF6 dice "antes que los demás managers", pero instalar en caliente rompe ese orden | La instalación en caliente **registra** la DCE y exige reinicio (RNF3). Tras el reinicio, el orden vuelve a ser el de RF6 |

## 7. Decisiones cerradas

| # | Decisión | Quién, cuándo |
|---|---|---|
| D1 | Valor del enum `dce`; rutas HTTP bajo `/core/dce`; clave de manifest y licencia `dces` (plural literal, como el resto de claves) | usuario, 2026-09-28 |
| D2 | Sin dependencias entre DCE en V1 | usuario, 2026-09-28 |
| D3 | Sin configuración en V1: solo objetos y código | usuario, 2026-09-28 |
| D4 | El host del back expone logger, libs, `configMaps` y `secrets` | usuario, 2026-09-28 |
| D5 | Consumidores de front en V1: plugins, diálogos de configuración, **themes y homepages**. Se planteó dejar fuera themes y homepages y se **descartó**: una homepage de la suite tiene que poder usar los iconos comunes de una DCE. Fuera solo los logins, por su renderer | usuario, 2026-09-29 |
| D6 | Subir una DCE fuera del rango de un consumidor se rechaza (RF11) | usuario, 2026-09-29 |
| D7 | Un pack instala sus DCE primero (RF12) | usuario, 2026-09-29 |
| D8 | RF10 espera al S3 de Status v2; no bloquea | usuario, 2026-09-29 |
| D9 | RF5 reutiliza `requiresExtension` (`dce:<id>:<versión mínima>`); sin clave `dces` | usuario, 2026-09-29 (desde el PLAN) |
| D10 | RF11 = bloquear el cambio de major con consumidores que exigen el anterior | usuario, 2026-09-29 (desde el PLAN) |

## 8. Qué NO entra, y dónde queda anotado

Para el backlog del PLAN, no para aquí:

- **Dependencias entre DCE** con orden topológico (V2).
- **Configuración** de una DCE: diálogo, `configRouter`, secretos con ojo (V2).
- **Sustitución en caliente** de una instancia, con notificación a los consumidores. Hoy es reinicio.
- **Control de acceso**: que una DCE declare qué consumidores admite.
- **La primera DCE real**: los iconos de IRIA como artefacto de pago. Es el caso que valida el tipo,
  pero su plan es privado y vive en el índice privado.
