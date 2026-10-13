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
| G2.1 | scaffold; port del back (log por `backChannelObject`, `ClusterInfo` estructural, common-back 0.6.4) | ⏳ |
| G2.2 | port del front: librerías (G-D5), DCE `file-manager`, CSS y PNG, helpers copiados | ⏳ |
| G2.3 | `onClusterSwitch` (G-D6) y `startChannel` del desktop (G-D7) | ⏳ |
| G2.4 | retirada del core: registro back y front, `useKeyboard`, dependencias que solo usaba Magnify | ⏳ |
| G2.5 | harness (mudado + nuevo) y e2e del plugin | ⏳ |
| G2.6 | CL9: QA, publicación, manifest, bundles (G-D9), `CHANNEL_MAGNIFY` fuera (G-D8), guía | ⏳ |
