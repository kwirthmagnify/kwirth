# metrics-plugin — el canal `metrics` sale del core — PLAN

> Estado: **CERRADO** (2026-10-11). Un único stream, M1, entregado con el QA validado por el usuario y el
> plugin publicado en npm público y en el marketplace público: `@kwirthmagnify/kwirth-plugin-metrics@0.1.0`
> (tag `plugin/metrics@0.1.0`). Sin PRD a propósito (D5): es una migración con precedentes (`ops`, `echo`,
> `trivy`), no una capacidad nueva. Append-only.

## Qué se ha hecho y por qué

El canal `metrics` era, con `magnify`, uno de los dos canales que seguían compilados dentro del core. Sale a
`plugins/metrics`, creado con `create-kwirth-plugin`, para que el core quede en lo que tiene que ser y la
imagen pueda llevarlo o no según la variante (`-core`, `-readonly`, `-full`).

Lo que **no** sale: el **provider `metrics`**, que lee los kubelets. Lo consumen también Magnify, alert, agora
y spectrum; el plugin se suscribe a él igual que alert. Y el `metricsList` que el front entrega a los canales
con `requirements.metrics`, que el core sigue sirviendo.

## Decisiones

| # | decisión |
|---|---|
| D1 | id `metrics`, paquete `@kwirthmagnify/kwirth-plugin-metrics`, OSS (npm público + manifest público), primera versión `0.1.0`. Mantiene su icono (`BarChart`) |
| D2 | **Un solo stream**: core y plugin comparten el id `metrics`, así que no pueden convivir registrados, y el front no compila mientras Magnify importe tipos del canal. Plugin y retirada del core van juntos |
| D3 | Los tipos que Magnify y ops usaban del canal **no** van a `kwirth-common-front`. El plugin implementa **`prepareExternalChannel`** (el hook genérico que ya usaban log y trivy) y entrega él su estado inicial; Magnify solo conserva una copia mínima de las formas (`MetricsExternalTypes.ts`) para aplicar su formulario |
| D4 | El `process.exit(1)` cuando el nodo de un pod no aparece en la lectura **se va**: en el core tumbaba el back, dentro de un plugin tumbaría Kwirth entero. Se registra y se salta el asset |
| D5 | Sin PRD; este PLAN basta |
| D6 | En los `kwirth-bundled-*.json`, `metrics` apunta a la URL de npm, como log y alert, y no a un tgz local |
| D7 | (aprobada durante el stream) **Bug heredado: las métricas `*_mbps` salían ×100** — el redondeo estaba copiado del de CPU %. Se arregla en el plugin |
| D8 | (aprobada durante el stream) **`CHANNEL_METRICS` se retira de todos los despliegues**: chart (sube a `0.3.1`), manifiestos, `kwirth-external` (`-cm`), values de ejemplo y yamls de `test/`. Era una variable que ya no leía nadie |
| D9 | (aprobada durante el stream, tras el QA) **Las métricas de cluster viajan en una serie propia, `Cluster`**. Las cuatro `kwirth_cluster_*` son un valor para todo el cluster y el canal las repetía dentro de cada asset: con *merge* salían N líneas idénticas con nombres de namespaces. Ahora salen una vez, sea cual sea la vista; el *merge* del front usa la unión de métricas de todos los assets |
| D10 | (tras el QA) `admin` entra en la escala de scopes del canal (`'', snapshot, stream, cluster, admin`), como en el resto de plugins OSS: el core avisaba `Inexistent scope 'admin'` |

## M1 — el canal `metrics` como plugin

| # | tarea | estado |
|---|---|---|
| M1.1 | Scaffold con `node tools/create-kwirth-plugin.mjs --id metrics …`; common-back `^0.6.1` y `implements IChannel` | ✅ |
| M1.2 | Back portado: suscripción al provider en `startChannel`, `cleanup()` que la suelta y para los intervalos, log por `backChannelObject`, `clusterInfo` tipado con una interfaz estructural mínima (patrón de spectrum) | ✅ |
| M1.3 | Front portado; la ayuda del setup sale de `channelObject.clusterUrl` (el plugin no ve el `SessionContext` del core) y recharts se resuelve contra `window.__kwirth__.recharts` | ✅ |
| M1.4 | Retirada del core: back (`index.ts`), front (`App.tsx`), `MetricDefinition` desde common-front, Magnify por `prepareExternalChannel` | ✅ |
| M1.5 | D4, D7, D9 y D10 | ✅ |
| M1.6 | D8: `CHANNEL_METRICS` fuera de los despliegues | ✅ |
| M1.7 | README del paquete, copiado al tarball por el build | ✅ |
| M1.8 | Harness propio (21: 14 back · 7 front, con las librerías de UI sustituidas por un stub) y e2e propio (3 specs · 10 casos: canal, Magnify, métricas de cluster con *merge*) | ✅ |
| M1.9 | Guía: página del plugin, índices de extensiones, despliegue (modos, variantes de imagen) e instalación; captura del dashboard regenerada con `zz-capture.spec.ts` | ✅ |
| M1.10 | Publicación `0.1.0`, entrada en el manifest público, bundles de imagen (D6), retirada de `kwirth-dev.json`, tag | ✅ |

**Validación**: harness del plugin 21/21; e2e del plugin 10/10 contra el dev; harness del core 707 (703 ✅ ·
4 ⏭ · 0 ✗); tests del chart 46/46 y de los manifiestos 26/26; typecheck de back y front del core limpio; QA
manual del usuario. La regresión e2e del core dio **21 rojos ajenos a este stream** (ver backlog).

## Lo que se encontró por el camino

- **El README público mentía en varias cosas** (manifiesto `test/kwirth.yaml` que no es el que se mantiene,
  un `docker run` que perdía los usuarios con `docker rm`, canales "que se activan al arrancar", logo en 404).
  Se corrigió a petición del usuario, junto con las secciones nuevas de Helm, imágenes y la tabla de las nueve
  combinaciones modo × imagen.
- **La guía de despliegue tenía el repo de Helm mal** (un `tree/` de GitHub) y un `masterkey` por defecto
  (`Kwirth4Ever`) que ya no existe. Corregido en la guía viva (0.6.31).

## Backlog (fuera de M1)

| tema | qué falta |
|---|---|
| ops | sigue construyendo a mano el estado del canal metrics con su copia de tipos (`plugins/ops/src/front/OpsExternalTypes.ts`); debería usar `prepareExternalChannel` como Magnify |
| variables muertas | `kwirth-external` sigue ofreciendo `-cl`, `-ca`, `-ce`, `-co`, `-ct`, `-cp`, y los yamls de `test/` llevan `CHANNEL_LOG/ALERT/ECHO/OPS/TRIVY/FILEMAN`: no las lee nadie |
| chart `0.3.1` | sin publicar en `kwirthmagnify.dev/helm-charts` (`publish-chart.mjs`) |
| imágenes | las variantes `-core` y `-readonly` no están en Docker Hub, y `-full` se define como "+ magnify" mientras Magnify sigue en el core; el README ya las documenta como existentes |
| e2e del core | 21 rojos deterministas ajenos a metrics (settings, portabilidad, gestores, extensiones que el dev no tiene instaladas); anotados en `docs/qa/test-metrics-history.md` |
