# DCE — dynamic core extension — Plan

> **ESTADO — VIVO** (2026-09-29). Cuelga de [PRD.md](PRD.md), que manda en el **qué** y el **por qué**.
> Documento **append-only**: lo que se decide no se borra, se marca. Si algo de aquí contradice lo que ves
> en el producto, gana el producto.
>
> D9 y D10 **confirmadas** por el usuario el 2026-09-29; el PRD ya las recoge en RF5 y RF11.

## Lo que ya existe y no hay que construir

Se inventarió por script (2026-09-29) todo lo que conoce el último tipo que se añadió, `aitoolset`, que
es además el más parecido a una DCE: sin diálogo de configuración y con un `back.js` que el core evalúa y
registra. Esa lista es la lista de sitios que toca una DCE.

- **El manager más simple como plantilla**: `AiToolsetManager` (índice en configMaps, `back.js` almacenado
  comprimido, instalación desde tgz, URL o carpeta local, overrides de `kwirth-dev.json`, `installBundled`).
  `DceManager` se calca de ahí y añade el `front.js`, que aquel no tiene.
- **El gestor genérico dirigido por descriptor** (`ExtensionManagerDialog` + `extensionManagerModel`): la
  DCE es un descriptor más, como `AiToolsetDescriptor`. Nada de un diálogo a medida.
- **`requiresExtension: ["tipo:id:versiónMínima"]`** en el `package.json` de cualquier extensión, con
  `validateExtensionDeps` y el `IInstalledIndex` de `ExtensionDeps.ts`. Es exactamente lo que RF5 necesita
  (ver D9). ⚠️ Hoy **solo lo valida `PackApi`**: instalar una extensión suelta no comprueba nada. RF8 obliga
  a validarlo también en los managers (S1).
- **La guardia del tipo nuevo**: `back/tests/tools/extensionDeps.test.ts` asserta que el índice conoce
  **todos** los tipos instalables. Se pondrá rojo al añadir `DCE` al enum: es la señal de que S1 empieza.
- **Los globales del core**: `global.__kwirth_back__` y `window.__kwirth__`, y el plugin de esbuild que
  resuelve paquetes contra ellos en cada `build.mjs`. El registro de DCE cuelga al lado, con el mismo
  mecanismo de resolución.
- **El aviso de reinicio/recarga** en un único sitio: `front/src/components/extensions/extensionRestart.ts`.
- **El patrón `usedBy`** de `cloud-config` para bloquear una desinstalación con consumidores.
- **Un stub de consumidor para validar E2E**, como hizo el tipo `webhook` con "un artefacto echo y un
  consumidor stub".

### Sitios que conocen un tipo (inventario del 2026-09-29)

| dónde | qué |
|---|---|
| `common/src/ExtensionType.ts` | el enum |
| `back/src/tools/ExtensionDeps.ts` | `IInstalledIndex` (+ su test guardia) |
| `back/src/tools/MarketplaceManager.ts` | `PUBLIC_FOLDER` (carpeta del manifest) |
| `back/src/tools/ExtensionRefs.ts` | portabilidad de configuración: todo lo instalado se lista |
| `back/src/api/PackApi.ts` | tres `switch` (instalado, install, uninstall) + índice de instalados |
| `back/src/index.ts` | manager, API y orden de arranque |
| `front/src/index.tsx` | el registro global del front |
| `front/src/App.tsx` | mapa de rutas por tipo (`:709`), menú y diálogo del manager |
| `front/src/components/extensions/<Tipo>Descriptor.ts` | el descriptor |
| `front/src/components/settings/SettingsPortability.tsx` | la familia en el diálogo de portabilidad |
| `tools/create-kwirth-<tipo>.mjs` + `tools/README.md` | el scaffold |
| `tools/scripts/create-pack.mjs` (`TYPE_DIRS`) | empaquetado |
| `front/e2e/tests/capture-managers.spec.ts` | capturas de la guía de los managers |
| `docs/0.6.31/guide/admin/08-extending-kwirth.md`, `guide/extensions/index.md`, `_sidebar.md`, `developing/` | guía |

## Streams

Cada stream cierra con su CL9 completa. Cada uno es un MVP: se puede instalar, usar y probar por sí solo.

### S1 — El tipo en el back: instalar una DCE y consumirla desde el back · ✅ HECHO (2026-09-29)

Entregado tal cual se planeó, más dos cosas que salieron por el camino: `assertDceRequirements` en los
**ocho** managers de consumidores (RF8, solo `dce:`), y el arranque de la DCE movido a **lo primero** de
`prepareRunningInstance()` — ver el registro de decisiones. Publicado `common 0.5.59` y
`common-back 0.5.56`; el back consume ambas. `dces/sample` construida y en `kwirth-dev.json`; **no se
publica en npm hasta S2**, cuando sea instalable desde el diálogo (y entonces nace `dces/manifest.json`).
QA manual validado en los cuatro pasos (orden de arranque, `boot #` persistido, dev declarativo, fábrica
rota aislada). Métricas: back 557 (+22) · e2e `dce-api` 4/4.

Lo planeado era:

**MVP**: una DCE de muestra se instala por API (tgz local o carpeta dev), el core la instancia una sola vez
y un consumidor de back la obtiene con `getDce()`. Sin UI todavía: el manager llega en S2.

- **Contrato** (`common/src/Dce.ts`, `common-back/src/IDce.ts`): `IDceMeta`, `IDceBack<T>` con
  `create(host)`, `IDceBackHost` (D4: logger, libs de `__kwirth_back__`, `configMaps` con prefijo
  `kwirth-dce-<id>-`, `secrets`), y `getDce<T>(id)` en `common-back`, que **lanza** si no está (RF4).
- **`EExtensionType.DCE`** y `IInstalledIndex.dce`. El test guardia pasa a verde con eso.
- **`DceManager`** calcado de `AiToolsetManager`: índice `kwirth-dce-index`, `back.js` y `front.js`
  almacenados, dev desde `kwirth-dev.json` (`dces`), `installBundled`. Al cargar, llama a `create()` **una
  vez** y guarda el resultado en `global.__kwirth_dce__[id]`. Un `create()` que revienta deja la DCE en
  estado *failed* con su causa, y no tumba nada (RNF2). `requiresRestart` se fuerza a `true` (RNF3).
- **Orden de arranque** (RF6): `dceManager.loadAll()` antes que cualquier manager que evalúe código de
  extensiones (providers, plugins, senders, webhooks, idps, aitoolsets).
- **`DceApi`** en `/core/dce`: listar, instalar (tgz, URL, marketplace), actualizar, desinstalar, y
  `/:id/front` sirviendo el `front.js` (lo usa S2).
- **RF8 en los managers**: `validateExtensionDeps` al instalar una extensión suelta, no solo en un pack.
  Es un cambio transversal a los managers que instalan consumidores; el mensaje dice qué falta.
- **RF9** y **RF11** en `DceManager.uninstall()` y `upgrade()`: quién declara `dce:<id>:` entre todo lo
  instalado (un resolutor inyectado, como las dependencias de `PackApi`), y se rechaza con esa lista.
- **Marketplace y licencia**: `PUBLIC_FOLDER[DCE] = 'dces'`; la licencia es un `Partial<Record<EExtensionType>>`
  y no necesita nada.
- **`ExtensionRefs`**: la DCE se lista en portabilidad como "sin configuración que exportar" (V1 sin config).
- **Muestra pública** `dces/sample`: exporta un objeto con un contador para **demostrar que es una única
  instancia** (dos consumidores ven el mismo número). Con README, `build.mjs` y `watch.mjs` del patrón.
- **Scaffold** `tools/create-kwirth-dce.mjs` calcado del de aitoolset, y su entrada en `tools/README.md`.
- **Harness** (`back/tests/tools/dceManager.test.ts`): carga y `create()` una sola vez; `create()` que
  falla aísla; `getDce` lanza si no está; uninstall bloqueado con consumidores; upgrade de major bloqueado
  (D10); orden de arranque; RF8 en un manager de consumidores.
- **e2e**: spec de API en `front/e2e/tests/dce-api.spec.ts` (request context): instalar la muestra, listar,
  intentar desinstalar con un consumidor declarado, desinstalar limpio.

### S2 — El front: manager, carga en orden y consumo desde los cuatro cargadores · ✅ HECHO (2026-09-29)

Entregado con **un ajuste en RF7** (D12, abajo): se carga el conjunto entero de DCE una sola vez, antes que
nadie, en vez de resolver las que declara cada consumidor. Publicado `common-front 0.5.64`. El stub
`dces/sample/consumer/` lee la DCE en los dos lados y su e2e comprueba lo único que importa: que los
contadores **crecen** entre lecturas. Métricas: +6 e2e (`dce-manager`), 6/6 en verde.

Lo planeado era:

- **`window.__kwirth_dce__`** en `front/src/index.tsx`, y `getDce<T>(id)` en `common-front` (RF4).
- **`loadDceFront(id)`** con promesa cacheada por id, y **`ensureDces(requiresExtension)`** que se llama
  **antes** de añadir el `<script>` en los cuatro cargadores (RF7): `loadPluginFront`, `ConfigFrontDialog`,
  `loadThemeFront`, `loadHomepageFront`. La DCE de front también se instancia una sola vez: el `front.js`
  registra `{ create }` y el cargador llama a `create(window.__kwirth__)` al terminar de cargar.
- **`DceDescriptor.ts`** para el gestor genérico; entrada en el menú y en el mapa de rutas de `App.tsx`;
  la familia en `SettingsPortability.tsx`.
- **Actualizar una DCE = recargar la página** (RNF4): un cuarto caso en `extensionRestart.ts`, con su texto.
- **Stub de consumidor** `dces/sample/consumer/`: un plugin mínimo, solo dev (`kwirth-dev.json`), que
  declara `requiresExtension: ["dce:sample:0.1.0"]` y pinta el contador de la muestra en back y en front.
  Es el que ejercita RF7 y RF8; no se publica.
- **Bundling del consumidor**: el `build.mjs` del stub documenta el mapeo `paquete → __kwirth_dce__[id]`
  en los dos plugins de esbuild (front y back). Es el patrón que copiará cada consumidor real.
- **e2e** en `front/e2e/tests/dce-manager.spec.ts`: instalar desde el diálogo; el stub muestra el contador
  y el mismo valor en dos pestañas (una instancia); abrir el stub **antes** de que la DCE haya cargado y ver
  que espera; desinstalar bloqueado con el stub instalado, y el diálogo dice quién; actualizar avisa de
  recargar. Capturas de la guía con `capture-managers.spec.ts`.

### S3 — Packs, scaffold de consumidores y guía · PENDIENTE

**MVP**: un pack con una DCE y su consumidor se instala en orden; un autor tiene guía y scaffold para
escribir una DCE y para consumirla.

- **Packs** (RF12): los tres `switch` de `PackApi`, `dceManager` inyectado, y las DCE **primero** en el
  orden de instalación del pack; `dce: 'dces'` en `TYPE_DIRS` de `create-pack.mjs`.
- **Scaffolds de consumidores**: opción `--dce <id>` en `create-kwirth-plugin.mjs` que deja el
  `requiresExtension` y el mapeo del `build.mjs` puestos. Los otros scaffolds, al backlog.
- **Guía**: la familia en `08-extending-kwirth.md`; `guide/extensions/dces/index.md` con la muestra; la
  sección de autor en `developing/` (el contrato, `create()`, el host, el mapeo del build, RF7 y los
  cuatro cargadores, por qué actualizar exige reinicio y recarga); `_sidebar.md`; `changelog.md`. Regenerar
  el tgz de la guía del core.
- **Kwirth Status (RF10)**: NO entra. Espera al S3 de Status v2 (D8).

### S4 — La primera DCE real · PRIVADO

Los iconos de IRIA como DCE de pago. Su plan vive en el **índice privado** y nada de él entra aquí.
Este plan se puede cerrar sin S4: S4 es quien lo valida, no quien lo termina.

## Decisiones

| # | Decisión | Estado |
|---|---|---|
| D1–D8 | en el [PRD](PRD.md) | cerradas |
| D9 | **RF5 reutiliza `requiresExtension`** (`dce:<id>:<versiónMínima>`) en vez de una clave `dces` nueva. Es el contrato que ya validan los packs y que ya conocen los once managers; una segunda clave para lo mismo es lo que este proyecto lleva meses quitando | confirmada, usuario, 2026-09-29 |
| D10 | Con `requiresExtension`, la dependencia es **versión mínima** (`>=`), no un rango: subir una DCE nunca "sale del rango". **RF11 se concreta en el major**: actualizar una DCE cambiando de major (1.x → 2.0) con consumidores que exigen un major inferior se rechaza. Es la convención semver de "major = rompe", sin inventar una sintaxis de rangos que el resto de tipos no tiene | confirmada, usuario, 2026-09-29 |
| D11 | El stub de consumidor vive dentro de `dces/sample/consumer/`, solo dev, y no se publica. Un plugin público que dependiera de la muestra obligaría a instalarla a todo el mundo | tomada, 2026-09-29 |
| D12 | **RF7 carga el CONJUNTO de DCE, no las que declara cada consumidor.** El plan pedía `ensureDces(requiresExtension)` por consumidor, y el `ConfigFrontDialog` no tiene a mano el meta de su extensión: resolver por consumidor obligaría a los cuatro cargadores a pedirlo antes. Una DCE es una librería compartida, no una funcionalidad, así que el conjunto es pequeño; y así la garantía no depende de que cada cargador se acuerde de preguntar. Una sola promesa cacheada en `front/src/tools/DceLoader.ts`, que los cuatro esperan | tomada, 2026-09-29 |

## Registro de decisiones

| fecha | decisión |
|---|---|
| 2026-09-29 | Nace el plan. Tres streams públicos (back, front, packs+guía) y uno privado (iria-icons). |
| 2026-09-29 | Se descubre que `requiresExtension` solo lo valida `PackApi`; RF8 lo lleva a los managers en S1. |
| 2026-09-29 | **Dónde arranca la DCE.** La primera versión la creaba en `setUpRoutes()`, junto a los IdP, creyendo que era lo primero. El orden real es `prepareRunningInstance()` → `startRunningInstance()` → `setUpRoutes()`: senders, webhooks, toolsets y providers cargaban ANTES que la DCE (RF6 roto) y el resolutor de consumidores se cableaba con `dceManager` sin crear, así que desinstalar una DCE en uso devolvía 200. Lo destapó el e2e de RF9, no el harness: el harness no arranca el core. Ahora es lo primero de `prepareRunningInstance()`, y el resolutor se cablea allí mismo con una closure que lee los managers en cada llamada. |
| 2026-09-29 | S1 cerrado. El tgz de `dces/sample` no se publica hasta S2: sin diálogo no hay desde dónde instalarlo. |
| 2026-09-29 | **El icono de un canal no puede llevar texto.** El stub devolvía `<span>◎</span>` en `getChannelIcon()`, y el selector de canales construye cada opción con el icono MÁS el nombre: el carácter se convirtió en el nombre accesible y el canal aparecía en la lista como `◎`, sin su id por ninguna parte. Nada parecía roto — la opción estaba ahí — y costó tres corridas del e2e encontrarlo. Un `SvgIcon` no aporta texto, que es por lo que el resto de canales no lo sufren. |
| 2026-09-29 | **Un e2e no puede elegir el cluster por nombre ni por posición.** Este Kwirth tiene seis clusters conectados y el stub solo está en el local; el primero de la lista dejaba el selector de canales vacío sin error, y la barra de título no sirve de pista porque se renombra con el cluster elegido. El spec prueba cada cluster y se queda con el que ofrece el canal, que además es justo la pregunta que se quiere responder. |

## Backlog

| # | Pendiente | Por qué no está hecho |
|---|---|---|
| B1 | Dependencias entre DCE (orden topológico) | V2 por decisión (D2) |
| B2 | Configuración de una DCE: diálogo, `configRouter`, secretos | V2 por decisión (D3) |
| B3 | Sustitución en caliente de la instancia con aviso a los consumidores | hoy es reinicio/recarga (RNF3, RNF4) |
| B4 | Control de acceso: qué consumidores admite una DCE | aceptado abierto en V1 (R3) |
| B5 | Kwirth Status lista las DCE (RF10) | espera al S3 de Status v2 (D8) |
| B6 | `--dce` en los scaffolds de provider, sender, webhook, theme y homepage | S3 solo lo hace en el de plugin |
| B7 | Validar `requiresExtension` al instalar cualquier extensión suelta, para **todos** los tipos y no solo para `dce:` | S1 lo introduce por RF8; generalizarlo es un cambio de contrato de los managers que merece su propio QA |
| B8 | Harness propio para `getDce()` de **common-front** | El paquete no tiene infraestructura de tests, y montarla es abrir un frente nuevo. El código es idéntico al de common-back, que sí tiene sus cuatro casos, y aquí lo cubre el e2e de verdad a través del stub |
| B9 | **La suite e2e del front arrastra 10 rojos que no son de la DCE** | Estado del entorno (configs de webhooks, `playground` instalado, tamaño del catálogo del marketplace), paquetes docs de plugins desactualizados (pinocchio, 404 en `user/04-triggers`) y preexistentes ya presentes el 2026-09-25. Arreglarlos dentro de este plan sería colar trabajo ajeno en su cierre |
