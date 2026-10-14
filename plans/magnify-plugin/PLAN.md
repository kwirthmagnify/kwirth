# magnify-plugin — el canal `magnify` sale del core — PLAN

> Estado: **VIVO** (2026-10-13). Decisiones validadas por el usuario el 2026-10-13. Sin PRD: migración con
> precedentes ([metrics-plugin](../completed/metrics-plugin/PLAN.md), [metrics-provider](../metrics-provider/PLAN.md),
> [events-provider](../events-provider/PLAN.md)). Todo lo que haga falta se **publica** (nada de `file:` ni
> symlinks). Objetivo de fondo: un core mínimo. Append-only.

## Qué es y qué lo ata al core

Magnify es el último canal compilado dentro del core: `back/src/channels/magnify` (1 fichero, 1055 líneas) y
`front/src/channels/magnify` (42 ficheros, ~16 500 líneas).

El core llega a Magnify en pocos sitios:

| dónde | qué |
|---|---|
| `back/src/index.ts:77, 261, 292, 1985` | import, `CHANNEL_MAGNIFY`, `registeredChannels.set('magnify')`, `requiredChannels.push` |
| `front/src/App.tsx:42, 645` | import y `frontChannels.set('magnify', MagnifyChannel)` (sin mirar `CHANNEL_MAGNIFY`) |
| `front/src/App.tsx:1517-1526` | `switchCluster`, "genérico", resetea a mano los campos de datos de Magnify en cualquier canal |
| `front/src/App.tsx:2800, 2838` | el arranque del desktop abre siempre una pestaña `'magnify'` |

Y Magnify usa del core:

| símbolo | dónde vive | destino |
|---|---|---|
| 13 funciones de Kubernetes (`nodeDrain`, `podEvict`, `scaleController`, `nodeShell`…) | `back/src/tools/KubernetesTools.ts`, que **solo** importa Magnify | `kwirth-common-back` (G-D2) |
| `getIconFromKind` (2243 líneas de SVG) | `front/src/tools/Constants-React.tsx`, también lo usa `App.tsx` | `kwirth-common-front` (G-D3) |
| `createChannelInstance`, `getChannelIconOf`, `getChannelIconSafe` | `front/src/tools/ChannelTools.ts` | `kwirth-common-front` (G-D3) |
| `backChannels`, `exitFullscreen` en `IChannelObject` | solo en la copia del core de `IChannel` | `kwirth-common-front` (G-D3) |
| `addGetAuthorization`, `clusterColor`, icono `Fullscreen`, `About` | core | copia en el plugin; `About` con `channelObject.kwirthVersion` |
| `useKeyboard` | core (ya solo para Magnify) | viaja con el plugin; en el core se borra |
| log (`componentLogger`) | core | `backChannelObject.log*` |
| `ClusterInfo` | core | interfaz estructural mínima en el plugin (patrón de spectrum/metrics) |

## Decisiones (validadas el 2026-10-13)

| # | decisión |
|---|---|
| G-D1 | id `magnify`, `@kwirthmagnify/kwirth-plugin-magnify`, OSS, `0.1.0`, su icono actual. Scaffolder `create-kwirth-plugin`. Sin PRD |
| G-D2 | Las 13 funciones de Kubernetes van a **`kwirth-common-back` 0.6.4**; el plugin las toma en runtime de la copia del core y no empaqueta client-node |
| G-D3 | `getIconFromKind` y `ChannelTools` pasan a **`kwirth-common-front`**; `IChannelObject` gana `backChannels` y `exitFullscreen`. Los helpers pequeños los copia el plugin; `About` usa `channelObject.kwirthVersion` |
| G-D4 | El explorador, del **DCE `file-manager`** (`requiresExtension dce:file-manager`), como fileman |
| G-D5 | El plugin **empaqueta** las librerías pequeñas que solo usa Magnify: `uuid`, `cron-parser`, `react-draggable`, `react-resizable`, `react-use`, `clipboard-copy`, `lodash` (solo lo que usa) y `js-yaml` (ninguna otra extensión del repo lo usa). CSS y PNG, inyectados desde el build |
| G-D6 | El reset de `switchCluster` sale del core: hook genérico del canal (`onClusterSwitch?`) y Magnify hace ahí su limpieza. Nada de `if channelId` en `App.tsx` |
| G-D7 | Desktop: el canal de arranque deja de estar escrito a mano. Campo genérico `startChannel` (valor `magnify`) y el core abre la pestaña solo si el canal está instalado |
| G-D8 | **`CHANNEL_MAGNIFY` desaparece** de todo (Helm sube de versión, manifiestos y sus tests, runner `external` —que además leía `options.magnify`, siempre `undefined`—, documentación) |
| G-D9 | Bundles: Magnify por URL de npm en **`-full`** y **desktop**. Hoy `-full` apunta a `bundle/plugins/magnify.tgz`, que no existe |
| G-D10 | Fuera de alcance: el acoplamiento de Magnify con otros plugins (ids escritos a mano `log`, `fileman`, `trivy`, `topology`, `ops`, `metrics`, `pinocchio`; la llamada directa al endpoint de Trivy) y las ventanas flotantes con el `useKeyboard` antiguo. Se portan tal cual |
| G-D11 | `back/tests/channels/magnifyUsage.test.ts` (6) se muda al harness del plugin. No hay e2e de Magnify: el plugin estrena el suyo (overview, navegación, detalle con eventos, avisos de provider ausente, embebido de otros canales) |

## Streams

- **G1** — common-back 0.6.4 y common-front publicadas; el core pasa a usarlas y borra sus copias. Se valida
  solo: el core sigue con su Magnify y todo funciona igual.

| # | tarea | estado |
|---|---|---|
| G1.1 | common-back **0.6.4** publicada: las 13 funciones de Kubernetes, portadas tal cual (el id de `imageDelete` con `crypto.randomUUID`, sin dependencia `uuid`); tipos de client-node con `resolution-mode: 'import'` (es ESM y common-back CJS); 12 tests (52/52) | ✅ |
| G1.2 | common-front **0.5.66** publicada: `getIconFromKind` (`KindIcons.tsx`) y `ChannelTools`, movidos con `git mv`; `backChannels` y `exitFullscreen` en `IChannelObject`; y ya declarado `onClusterSwitch?` en `IChannel` (G-D6), para no publicar otra vez en G2 | ✅ |
| G1.3 | core sobre las dos versiones; fuera `back/src/tools/KubernetesTools.ts`, `Constants-React.tsx` y `ChannelTools.tsx`; harness 711 (0 ✗), e2e del selector + `dialog-escape` 13/13 y providers events/metrics en verde | ✅ |
| G1.4 | CL9: QA validado por el usuario (4/4: iconos en home y selector, iconos de Magnify, scale/restart/cordon/uncordon, canales embebidos — "va lento, pero creo que es del cluster", a vigilar tras G2); changelog; fila del histórico del core; commit y push. Sin tag: solo cambian librerías | ✅ |

- **G2** — el plugin y la retirada del core, **atómico** (comparten id, como en M1).

| # | tarea | estado |
|---|---|---|
| G2.1 | scaffold; port del back: `ClusterInfo` estructural (`IMagnifyClusterInfo`, tipos de client-node solo como tipos), operaciones de common-back 0.6.4, log por `backChannelObject` con un adaptador (las ~40 llamadas `this.log.*` intactas); `requiresExtension`: DCE `file-manager` y providers `events` y `metrics` (como plugin ya puede declararlos) | ✅ |
| G2.2 | port del front: imports del core a common-front; `clusterColor` y `addGetAuthorization` copiados (`CoreHelpers.ts`), `About` propio con `kwirthVersion`, icono `Fullscreen`; globals del core para React, ReactDOM, codemirror, recharts y el explorador (DCE); empaquetadas las pequeñas, `lodash/get`+`lodash/set` y `react-use/lib/useAsync` sueltos; CSS como texto inyectado desde `index.ts`; JSX con `inject` de React (el core usaba el runtime automático); **los 7 PNG de las secciones pasan a SVG** (pedido del usuario, toman el color del tema); front minificado: 524 KB (133 KB gzip), venía de 1,6 MB | ✅ |
| G2.3 | `onClusterSwitch` (G-D6): `switchCluster` llama al hook y el plugin hace su limpieza. `startChannel` (G-D7): los lanzadores (Tauri, Electron y `start:desktop`) ponen `KWIRTH_START_CHANNEL=magnify`, el back lo sirve en `/core/auth/method` y el desktop lo usa como canal de arranque del usuario, cuyo efecto ya espera a que cargue el plugin. Se probó primero como campo de `KwirthData` (kwirth-common 0.5.67) y se descartó: en el flujo remoto del desktop llegaría el del Kwirth remoto; 0.5.68 lo retira | ✅ |
| G2.4 | retirada del core: back (`channels/magnify`, registro, `CHANNEL_MAGNIFY`), front (`channels/magnify`, registro, `useKeyboard` antiguo, `useEscape.ts`), seis dependencias del front; `kwirth-dev.json` carga el plugin | ✅ |
| G2.5 | harness del plugin 6/6 (mudado del core, con un `clusterInfo` falso que imita el handle del core); primer e2e de Magnify, 5/5; regresión: providers events y metrics, selector de recursos y `dialog-escape` en verde; core 705 (0 ✗) | ✅ |
| G2.6 | CL9: QA, publicación, manifest, bundles (G-D9), `CHANNEL_MAGNIFY` fuera (G-D8), guía | ⏳ QA |

- **G3** — las extensiones del bundle de imagen/desktop (decidido por el usuario el 2026-10-13: antes de cerrar
  G2, que lo necesita para G-D9). Encontrado al preparar los bundles de Magnify:
  1. no hay `installBundled` para **providers**: los del bundle no se instalan nunca (lo que P1 y E1 dijeron en la
     guía —metrics y events "vienen instalados" en `-readonly`/`-full`/desktop— no era cierto);
  2. `fetch-bundled.mjs` guarda `<id>.tgz`: el provider `metrics` choca con el plugin `metrics` y se descarta; y
     `PluginManager` saca el id del plugin del NOMBRE del fichero;
  3. `fetch-bundled.mjs` no conoce `dces`;
  4. ~~el arranque instala los plugins del bundle antes de que existan los gestores de providers y DCEs, y un plugin
     que requiere uno del bundle (Magnify) es rechazado~~ — **retirado**: `assertExtensionRequirements` se salta lo
     que viene del bundle (como dev y packs), así que no había rechazo. Se llegó a reordenar el arranque y se deshizo.

| # | tarea | estado |
|---|---|---|
| G3.1 | `ProviderManager.installBundled`, como el de DCEs (misma versión → se salta; otra → `upgrade`) | ✅ |
| G3.2 | `PluginManager.installBundled` saca id y versión del `package.json` del tgz (`peekBundledMeta` en `BundledExtensions`); con el nombre del fichero, una versión nueva en la imagen chocaba con "already installed" | ✅ |
| G3.3 | `fetch-bundled.mjs`: fichero `<tipo>-<id>.tgz` y tipos `dces` y `aitoolsets` | ✅ |
| G3.6 | (pedido por el usuario, 2026-10-14) cada build lleva la **última versión** de todo lo bundled: las entradas valen `"latest"` y `fetch-bundled` las resuelve contra el manifest público de su tipo (no contra npm: una versión retirada del manifest no entra); `build-image` resuelve en el host y mete el JSON ya resuelto (si no, la caché de Docker se quedaba con la primera); la carpeta de salida se vacía de `.tgz` antes (el desktop arrastraba `events.tgz`, `metrics.tgz` y una guía de julio versionada en git, ya fuera). `-readonly` + `echo`; `-full` + `fileman`, `topology`, `echo` y la DCE `three` | ✅ |
| G3.4 | ~~orden de arranque~~ — no hacía falta (ver punto 4) | ✖ |
| G3.5 | 5 tests en `bundledExtensions` (id y versión del paquete; providers del bundle instalados; misma versión se salta, otra actualiza; un plugin de la imagen se actualiza tras un reinicio). Con un bundle real descargado por `fetch-bundled` (providers `events` y `metrics`, plugins `metrics` y `magnify`, DCE `file-manager`) los gestores del core instalan las cuatro extensiones; core 710 (0 ✗) | ✅ |

**Backlog del plugin** (anotado en G2): el harness solo cubre el `USAGE` y los eventos (24,7 % de líneas); los
comandos del back (listas, apply, delete, operaciones de nodo) no tienen tests. `cron-parser` arrastra luxon
(~380 KB sin minificar) solo para la próxima ejecución de un CronJob.
