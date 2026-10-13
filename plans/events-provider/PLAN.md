# events-provider — el provider `events` sale del core — PLAN

> Estado: **VIVO** (2026-10-13). Decisiones validadas por el usuario el 2026-10-13. **E1 entregado** el 2026-10-13
> (QA validado, publicado y etiquetado); queda E2, bloqueado por el GitLab privado. Todo lo que haga
> falta se **publica** (nada de `file:` ni symlinks). Sin PRD: migración con dos precedentes (`business`, [metrics-provider](../metrics-provider/PLAN.md)).
> Objetivo de fondo: un core mínimo — después de este, Magnify como plugin. Append-only.

## Qué es y quién lo usa

`back/src/providers/events/EventsProvider.ts` (333 líneas): vigila 28 tipos de recurso + `/api/v1/events` con
`Watch` de client-node, un watcher por cada CRD que aparece, y reparte `{ type, obj }` filtrando por `kinds`.
Endpoint `GET /provider/events` (raw `CoreV1Event[]`) y método `getEvents(query)`.

| consumidor | cómo | |
|---|---|---|
| Magnify (core) | suscripción + llamada directa a `getEvents()` (cast que importa la clase) | core |
| topology, pinocchio, censor (+ pack censor) | suscripción | públicos |
| agora, excubitor, iter, montag | suscripción; excubitor además `getEvents()` directo (cast estructural) | privados |
| front `getClusterEvents` → homepages avicii, depeche-mode, matrix | HTTP `/provider/events` | core + públicas |
| AI toolsets (`k8s-observability`) | indirecto, por el buffer de agora | — |

Nadie declara `events` como requisito: hoy lo da el core.

## Decisiones (validadas el 2026-10-13)

| # | decisión |
|---|---|
| E-D1 | id `events`, `@kwirthmagnify/kwirth-provider-events`, OSS, `0.1.0` |
| E-D2 | el watch de Kubernetes sale a **`kwirth-common-back` 0.6.2** como `createResourceWatcher(clusterInfo, path, onEvent, opciones)` (en `KubernetesTools`, con los reintentos que hoy tiene el provider). El provider lo importa de common-back, resuelto en runtime contra la copia del core (`global.__kwirth_back__.kwirthCommonBack`), así que no empaqueta client-node. Descartadas: el informer existente (lista primero → un `ADDED` por cada objeto del cluster; pinocchio analizaría con el LLM cada pod existente), empaquetar client-node (15 MB), exponer `Watch` suelto en los globals, y un watch a mano con `fetch` (protocolo y autenticación) |
| E-D3 | endpoint al `configRouter` (`/core/providerconfig/events`, tras el accessKey); el helper del front se generaliza a `fetchProvider(cluster, id, subpath)` con fallback a `/provider/events` |
| E-D4 | **Lectura bajo demanda genérica en el contrato** (`kwirth-common-back` 0.6.2): `IProvider.getData?(request: Record<string, unknown>): Promise<unknown>` y `getDataHelp?(): IProviderSubscriptionHelp`; `IProviderHandle.getData(request)`, que rechaza con un error claro si el provider no la implementa. El consumidor la pide por el handle (`clusterInfo.getProvider('events', this).getData({...})`), así queda registrado. `events` atiende `{ namespace?, kind?, name?, limit? }` → `CoreV1Event[]`; Magnify pasa a usarlo. `getEvents()` se mantiene mientras excubitor (privado, E2) lo llame |
| E-D5 | sin Kubernetes, el provider lo detecta por `clusterType`; fuera el `registeredProviders.delete('events')` |
| E-D6 | `events` en los bundles `-readonly`, `-full` y desktop |
| E-D7 | `requires` → públicos: topology, pinocchio, censor (+ pack); privados: agora, excubitor, iter, montag + manifest privado |
| E-D8 | Magnify avisa si falta el provider, como con metrics |

## Streams

- **E1** (atómico), en este orden:

| # | tarea | estado |
|---|---|---|
| E1.1 | `kwirth-common-back` **0.6.2 publicada**: `getData`/`getDataHelp` en `IProvider`, `getData` en `IProviderHandle`, `createResourceWatcher` en `KubernetesTools` (5 tests contra un API server falso; 39/39) | ✅ |
| E1.2 | Core sobre common-back 0.6.2 (instalada del registro): `getData` en el handle (rechaza claro si el provider no lo sirve; no registra suscripción), Magnify por `getData` + aviso si falta el provider (`USAGE` lleva `eventsProvider`), fuera el registro de `events` y su desregistro sin Kubernetes, front con `fetchProvider(cluster, id, subpath)` + fallback (metrics y events) | ✅ |
| E1.3 | `providers/events` (scaffold): port con `createResourceWatcher`, `configRouter`, `getData` + `getEvents`, `clusterType`; 13 tests (6 mudados del core) | ✅ |
| E1.4 | e2e del provider 5 + 1 (el del aviso, lanzado sin el provider: ✅), con el *push* real vía `kubectl`; plugin metrics 10/10; core 711; regresión: los 23 rojos, corregidos y en verde (de paso, el Escape de los diálogos del core, `closeOnEscape`, y fuera el stub `dce-consumer`); fila del histórico + PNG | ✅ |
| E1.5 | CL9: QA validado (7/7; el 6 tras rehacer el Escape); guía (página nueva del provider, índice de providers sin built-in en cluster, Magnify, referencia, changelog, sidebar, captura del gestor); `provider/events@0.1.0` publicado + manifest + bundles `-readonly`/`-full`/desktop; cascada pública: `topology@0.3.2`, `censor@0.2.55`, `pinocchio@0.2.42` (+ su guía `0.2.42`, lockstep), `pack/censor@0.1.4`, todos sobre common-back 0.6.3, con su `requires` en el manifest y el README corregido donde decía que el core da los eventos | ✅ |
- **E2** (cuando vuelva el GitLab privado `repo.plexus.services`): cascada privada + montag (abajo). **Orden
  decidido por el usuario (2026-10-13): tras cerrar E1 va antes Magnify como plugin, y E2 después.**
  ✅ **Desbloqueado** (2026-10-13, ~13:00): el GitLab privado vuelve a estar operativo. Sigue el orden: después de Magnify.

## Para revisar (encontrado en E1)

- **Los CRDs se reparten a todos.** Cada CRD que aparece se añade a la lista de **todos** los suscriptores, así
  que todos reciben las instancias de los CRDs nuevos aunque solo pidieran, por ejemplo, Pods (topology, censor…).
  Es el comportamiento del provider del core y se ha portado tal cual (un test lo fija). Revisar si debería
  limitarse a quien lo pide con `syncInstances`.
- **`getData` no deja rastro en el registro.** Es una lectura puntual: no crea arista de suscripción. Si se quiere
  que el grafo de Status muestre quién lee de quién, hace falta un registro de lecturas aparte.

## Salido durante el cierre de E1 (2026-10-13)

- ✅ **Watch que se rendía en recursos tranquilos** (`kwirth-common-back` **0.6.3**, publicada). El contador de
  reintentos solo volvía a cero al llegar un evento, así que cada cierre normal del API server (30-60 min) sumaba
  uno, y un recurso sin cambios (configmaps, un CRD) dejaba de vigilarse para siempre al sexto. Ahora vuelve a
  cero al CONECTAR; solo los fallos seguidos al conectar llevan a rendirse. ⚠️ `Watch.watch()` de client-node no
  lanza al no conectar (llama a `done(err)` y devuelve), así que "conectado" es "volvió con el intento abierto".
  Venía igual del provider del core. Tests: common-back 40/40, provider 13/13.
- ✅ **Escape en los diálogos del core** (`useEscapeToClose` en `tools/useKeyboard.ts`, 9 diálogos). El hook
  anterior cerraba el diálogo entero con un desplegable abierto, se llevaba también el de debajo y tragaba todo
  `keydown`. Un primer arreglo por el `onClose` de MUI rompió lo que sí funcionaba (Escape sin foco dentro, el
  caso normal al abrir desde el menú); el definitivo escucha en `window`, respeta desplegables abiertos y solo
  cierra el diálogo de arriba. e2e `dialog-escape` (3). QA validado.
- ⏳ **Ventanas de Magnify** (`ResizableDialog`: `ContentDetails`, `ArtifactSearch`, `UserPreferences`) siguen
  con el `useKeyboard` antiguo y sus dos fallos. → stream **Magnify como plugin**.
- ⏳ **Pedido por el usuario**: en el aviso *"This channel stopped working"*, poder **copiar el stacktrace**
  (mensaje + stack + componente), para reportarlo.
- ⏳ **Pedido por el usuario**: la card superior de la Homepage (`App.tsx`) pinta los **iconos de los channels
  de forma síncrona**; revisarlo y cargarlos de forma asíncrona.

## Para revisar (anotado por el usuario, 2026-10-13)

- **montag**: su suscripción a `events` está para enterarse de los pods que **aparecen o desaparecen** y cumplen
  la configuración activa, y así engancharse o soltarse de sus logs. Se suscribe con `{}` y, con el filtro
  estricto (`kinds`), **no recibe ningún Pod**: no ve pods nuevos ni muertos. Revisar a fondo y probarlo, no solo
  cambiar el payload. Va con E2 (privado).
- **pinocchio**: manda `{ kinds, crdInstances: [], syncCrdInstances: false }`; el provider lee `syncInstances`.
  Hoy no cambia nada (es `false`), pero no está claro el impacto de corregirlo: revisar qué recibe realmente y qué
  cambiaría. **No se toca en E1**; en la cascada pública solo se añade el `requires`.
