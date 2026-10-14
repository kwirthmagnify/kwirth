# metrics-provider — el provider `metrics` sale del core — PLAN

> Estado: **VIVO** (2026-10-13). P1 entregado, con el QA validado por el usuario y publicado:
> `provider/metrics@0.1.0`, `plugin/metrics@0.1.1`, `plugin/alert@0.2.27`, `plugin/pinocchio@0.2.41` (+ su guía
> `0.2.41`). **Queda una sola cosa**: la parte de pago de D5 (`spectrum` y `agora`), bloqueada porque el GitLab
> privado `repo.plexus.services` está caído (sus repos y el manifest privado viven ahí). Sin PRD a propósito (D6): migración con precedente
> (`business`, [plan](../completed/business-provider/PLAN.md)). Sigue a [metrics-plugin](../completed/metrics-plugin/PLAN.md),
> que sacó el **canal**. Append-only.

## Qué y por qué

El provider `metrics` lee los kubelets (cAdvisor y `/stats/summary`) y reparte lecturas a sus suscriptores. Es
de lo último que sigue compilado en el core, junto con `events` y el canal Magnify. Sale a `providers/metrics`
para que el core no cargue con algo que solo tiene sentido con un Kubernetes detrás, y para que cada variante de
imagen decida si lo trae.

Consumidores: el canal **Magnify** (core) y los plugins **metrics**, **alert**, **pinocchio**, **spectrum** y
**agora** (de pago). `echo` no: su `'metrics'` es una señal de OpenTelemetry.

## Decisiones (validadas por el usuario el 2026-10-12)

| # | decisión |
|---|---|
| D1 | id `metrics` (sin cambio: ningún consumidor se toca por el id), paquete `@kwirthmagnify/kwirth-provider-metrics`, OSS, `0.1.0`. Un provider y un plugin con el mismo id ya conviven (`trivy`) |
| D2 | Un solo stream: core y extensión comparten id, así que extensión y retirada del core van juntas |
| D3 | Las rutas del provider (lista de métricas, uso del cluster, config) pasan al **`configRouter`**, que el core monta detrás del accessKey en `/core/providerconfig/metrics/…`. El front usa la ruta nueva y, si recibe 404, prueba la antigua `/provider/metrics` (clusters remotos con versiones anteriores) |
| D4 | Lo traen las imágenes `-readonly` y `-full` y el **desktop** (`back/kwirth-bundled.json`, que hoy no trae nada — y desde metrics-plugin tampoco el canal metrics, que también se añade) |
| D5 | `requiresExtension` hacia `provider:metrics` en `metrics`, `alert`, `pinocchio`, `spectrum` (npm + manifest público) y `agora` (Nexus + manifest privado). Magnify, mientras sea del core, no puede declararlo: lo cubre D4 |
| D6 | Sin PRD; este PLAN |

## Lo que ata el provider al core, y cómo se desata

| acoplamiento | solución |
|---|---|
| Router con `AuthorizationManagement.validKey` del core | D3 |
| Escribe `clusterInfo.vcpus` / `memory`, que `ConfigApi` publica | el core los calcula de `node.status.capacity` en `getNodes()`; el provider guarda los suyos |
| El core le cambia el intervalo en vivo con un cast a `MetricsProvider` | el intervalo sigue en los settings del core, que ya escribe `kwirthData.metricsInterval` (el mismo objeto que recibe el provider); el provider lo mira en cada tick y se reprograma |
| Sin Kubernetes el core lo desregistra | el provider detecta que no hay API/token, avisa una vez y no arranca |
| Magnify importa `IMetricsClusterUsage` | copia mínima local |
| `ProviderApi` trata `events` y `metrics` como del core | queda solo `events` |
| `back/tests/providers/metricsNoToken.test.ts` | se muda al harness del provider |

## P1 — el provider `metrics` como extensión

| # | tarea | estado |
|---|---|---|
| P1.1 | Scaffold con `create-kwirth-provider --config none`; `configRouter` añadido a mano y `express` contra la instancia del core | ✅ |
| P1.2 | Provider y modelo portados, con la tabla de arriba. La ruta `/config` (GET/POST del intervalo) no se porta: nadie la llamaba | ✅ |
| P1.3 | Retirada del core: `index.ts`, `ProviderApi`, `ClusterInfo.getNodes()` calcula la capacidad, Magnify con copia mínima de tipos, front con `fetchMetricsProvider` (ruta nueva + fallback) | ✅ |
| P1.4 | Harness del provider (11, con un kubelet falso) y e2e (7: instalado y corriendo, rutas, datos, capacidad en el core, overview de Magnify); e2e del plugin metrics 10/10 contra la extensión; core 707 (3 tests nuevos de capacidad) | ✅ |
| P1.6 | (pedido por el usuario) Magnify avisa en su overview si falta el provider: `USAGE` lleva `metricsProvider` (`IMagnifyClusterUsage`); test de back (3) y e2e `02-magnify-without-provider` (se salta si el provider está) | ✅ |
| P1.5 | CL9: QA validado (7/7); guía (página nueva del provider, índices, Magnify, metrics, settings, referencia técnica); provider publicado; bundles `-readonly`/`-full`/desktop con provider + plugin; manifests públicos; tags | ✅ |
| P1.7 | D5, parte OSS: `metrics` 0.1.1, `alert` 0.2.27 y `pinocchio` 0.2.41 con `requires` hacia `provider:metrics:0.1.0` (y common-back 0.6.1). La guía de pinocchio sale en lockstep **con README por primera vez**: su generador no lo metía y la 0.2.40 se publicó sin él | ✅ |
| P1.8 | D5, parte de pago: `spectrum` y `agora` (+ sus guías en lockstep) al Nexus y al manifest privado | 🟡 `spectrum` 0.7.4 + guía 0.7.4 publicados (2026-10-14). `agora` pendiente: su repo tiene una 0.2.5 a medias sin validar |

## P2 — las lecturas ya no se cuelgan ni se encadenan (2026-10-13)

Pedido por el usuario tras ver *"Still loading cluster metrics"* en cada tick durante toda la tarde. Causa
principal: el intervalo del dev estaba guardado a **3 s** y una lectura de dos nodos no cabe; puesto a 15 a
petición del usuario. Lo que cambia el provider:

| # | tarea | estado |
|---|---|---|
| P2.1 | timeout por llamada al kubelet: 40 % del intervalo con **suelo de 10 s** (la primera versión, sin suelo, cortaba a 1,2 s con 3 s y dejaba sin métricas); corta también el cuerpo y el error nombra nodo y endpoint | ✅ |
| P2.2 | nodos en paralelo (`allSettled`) | ✅ |
| P2.3 | *Still loading* una vez por racha + aviso al acabar con lo que tardó y los ticks saltados | ✅ |
| P2.4 | `startMetricsInterval` no deja dos relojes | ✅ |
| P2.5 | CL9: harness 16/16, e2e 7 ✅ · 1 ⏭, QA validado por el usuario (4/4), guía y README, `provider/metrics@0.1.1` publicado + manifest + bundles | ✅ |

## Backlog (fuera de P1)

| tema | qué falta |
|---|---|
| desktop | si el kubeconfig autentica con **certificado de cliente**, las opciones de `applyToFetchOptions` llevan un `agent` que el `fetch` nativo de Node ignora; con token funciona |
| pinocchio-help (e2e del core) | ✅ 2026-10-13: en verde con la guía 0.2.41 instalada |
| core mínimo | siguientes: `events` como provider (✅ E1, [events-provider](../events-provider/PLAN.md)) y Magnify como plugin (pedido del usuario, 2026-10-13) |
| lecturas que se encadenan (visto 2026-10-13) | ✅ **provider 0.1.1** (P2, publicado): timeout por llamada del 40 % del intervalo, que nombra nodo y endpoint; nodos en paralelo; un solo reloj. La causa real fue una lectura **colgada** (API y kubelets respondían en 68-100 ms), no la lentitud. Queda el ruido del **plugin** metrics: un `No node … asset skipped` por pod en el intervalo sin datos | *(entrada original, abajo)* |
| lecturas que se encadenan (visto 2026-10-13) | con el API server colgado (`UND_ERR_CONNECT_TIMEOUT` hacia el reenvío de puertos de Docker Desktop), cada `fetch` espera 10 s de conexión: 2 llamadas × N nodos superan el intervalo y sale *"Still loading cluster metrics"*. Dar a cada `fetch` un timeout menor que el intervalo (`AbortSignal.timeout`) y leer los nodos en paralelo, para que un corte cueste un intervalo y no se encadene. El canal escribe además un `No node … asset skipped` **por pod** en ese intervalo: uno por intervalo bastaría. La lógica es la del core original, no la introdujo P1 |

### Dónde se quedó (2026-10-12, parado por el usuario) — superado, se cerró el 2026-10-13

- P1.1–P1.4 y P1.6 hechos y **sin commitear**: `providers/metrics/` (nuevo), los cambios del core (`index.ts`,
  `ClusterInfo.ts`, `ProviderApi.ts`, `CoreLogProvider.ts`, Magnify back/front, `Global.ts`, `App.tsx`,
  `Homepage.tsx`), el borrado de `back/src/providers/metrics/` y el test mudado al provider.
- El provider está registrado en `back/kwirth-dev.json` y el plugin metrics `0.1.0` instalado en el dev desde
  el marketplace público.
- **Falta, en este orden**: (1) regresión e2e del core. Se cortó dos veces y la tercera quedó contaminada (el
  marketplace privado `repo.plexus.services` caído, timeouts del Postgres del dev y un reinicio del back por un
  cambio en `kwirth-dev.json`). Relanzar con el back estable y luego `--last-failed`; lo que dependa del
  marketplace privado se cuenta como saltado mientras siga caído. (2) Fila del core en `docs/qa`. (3) Pasos del
  QA manual y **parar** (gate). (4) Resto del CL9: guía, bbpm del provider, manifest, bundles (D4), cascada de
  `requires` (D5), plan, commit, tags, push.

### Encontrado por el camino

- 🔴 **Desktop sin credenciales hacia el kubelet**: con `@kubernetes/client-node` 1.x `applyToFetchOptions`
  devuelve las opciones a usar, y el core las descartaba. Arreglado en el provider (test dedicado). ⚠️ Lo que
  queda: si el kubeconfig autentica con **certificado de cliente**, las opciones llevan un `agent` que el `fetch`
  nativo de Node ignora; con token sí funciona. Al backlog.
- Desde metrics-plugin el **desktop no trae el canal metrics** (su `kwirth-bundled.json` no lleva ninguna
  extensión): lo arregla D4.
