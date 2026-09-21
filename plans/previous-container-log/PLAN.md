# Log del contenedor anterior

> **Estado: en producción, salvo el ajuste en los settings.** S1, S3 y S4 cerrados el **2026-09-20**
> (CL9 completo: 344 tests en el core, +1 spec e2e con 2 casos, guía y captura). **Queda el S2**: el número
> de líneas se configura hoy por `PREVIOUSLOGLINES`, y llevarlo a la pantalla de settings obliga a publicar
> `@kwirthmagnify/kwirth-common` y a subir la dependencia en back y front — decisión de publicación
> pendiente, no trabajo pendiente.

## Por qué

Cuando el core muere dentro del cluster, el pod reinicia y **el log que explica la muerte se queda en el
contenedor anterior**. Hoy hay que estar delante con un `kubectl logs --previous`, y normalmente nadie lo
está: para cuando alguien mira, el kubelet ya lo ha rotado o el pod se ha recreado. La consecuencia
práctica es que los cierres anómalos se investigan a ciegas.

El caso que lo motivó es real y de este mismo día: un `unhandled rejection` del provider `trivy`
—`reportTypes is not iterable` en un fire-and-forget sin catch— tumbó el core entero por su propio
handler. Nadie vio la traza hasta que se reprodujo a mano.

Ya existe una pieza en esa dir, `kwirth-secure-log`: el ConfigMap donde `exitAndLog()` deja el motivo de
la salida. Esto es lo complementario — no *por qué* dijo que salía, sino **qué estaba pasando justo antes**.

## Decisiones

Tomadas por el usuario, no negociadas aquí:

| decisión | qué se hace |
|---|---|
| cuándo se lee | **al arrancar**, y solo en modo kubernetes dentro del cluster |
| dónde vive | **en memoria**, no en un ConfigMap. Se relee en cada arranque, así que persistirlo no aporta |
| cierre anómalo | además del log, **un aviso en notifications** |
| quién lo ve | **solo administradores**: el log del core lleva nombres de recursos, rutas y trazas internas |
| cuánto | **1000 líneas**, configurable **en los settings de Kwirth** |
| dónde se consulta | botón en el diálogo **About** |

## Lo que hay que saber antes de tocarlo

- **`--previous` no siempre existe.** Solo hay log anterior si el contenedor reinició **dentro del mismo
  pod** (crash, OOM, CrashLoopBackOff) — que es justo el caso que interesa. En un rollout el pod es otro
  y el kubelet no guarda nada del viejo. La UI tiene que distinguir "no hubo reinicio" de "hubo reinicio
  pero el log ya no está", porque son cosas distintas y la segunda es la que desconcierta.
- **El core ya sabe quién es**: `getKubernetesKwirthData()` localiza su propio pod por `process.env.HOSTNAME`
  y de ahí salen namespace y deployment.
- **Leer el log ya está resuelto**: `MagnifyChannel` usa `coreApi.readNamespacedPodLog({ name, namespace, container, tailLines })`.
  Aquí es lo mismo más `previous: true`. No hace falta nada nuevo contra la API de Kubernetes.
- **El cierre anómalo se detecta por el estado del pod**, no adivinando: `containerStatuses[].lastState.terminated`
  da `exitCode`, `reason` (Error, OOMKilled…) y las marcas de tiempo. `restartCount` dice cuántas veces.
- **RBAC**: no hay permisos nuevos. El core ya lista pods y ya lee logs (el canal `log` vive de eso).
- **Aviso global en el front**: `notify(undefined, ENotifyLevel.WARNING, …)` en `App.tsx`, el mismo camino
  que usa "Updates available".
- **Cascada de publicación**: `IKwirthSettings` vive en `common/src/Global.ts` y ni back ni front tienen
  `paths` al source — compilan contra el paquete. Un campo nuevo obliga a bump + publish de
  `kwirth-common` y a subir la dependencia en los dos, con reinicio del front.

## Streams

### S1 — el back lo lee y lo guarda ✅

Al arrancar, si `runningEnv.isK8s && kwirthData.inCluster`: leer `lastState.terminated` del propio
contenedor y, si hubo reinicio, pedir el log previo con `previous: true` y `tailLines`. Queda en memoria
junto a lo que ya se sabe de la terminación. Si la lectura falla (no hay log anterior, el kubelet lo rotó,
la API responde 400) **no es un error del arranque**: se anota y el core sigue.

Lo que NO hace este stream: nada de red hacia el front. Solo dejar el dato disponible y una traza de
arranque que diga si hay log previo y por qué murió.

### S2 — el ajuste en los settings ⏳

`previousLogLines` en `IKwirthSettings` (1000 por defecto), con su campo en la pantalla de settings.
Arrastra el bump y el publish de `kwirth-common`, y la subida de dependencia en back y front.

### S3 — el endpoint, solo admin ✅

Devuelve `{ restarted, exitCode, reason, startedAt, finishedAt, lines[] }`. Un no-admin recibe 403, y el
front ni ofrece el botón. Es el stream donde hay que ser puntilloso con la autorización: este endpoint
entrega trazas internas del core.

### S4 — el About y el aviso ✅

Botón en el About (solo admin) con un visor de las líneas, y el aviso por `notify(undefined, WARNING, …)`
cuando el arranque detecta que el anterior no fue limpio. El aviso se da **una vez por arranque**, no en
cada recarga de la SPA: un usuario que abre Kwirth diez veces no tiene que ver diez avisos del mismo
reinicio.

## Cómo quedó

Lo que se decidió mientras se escribía, y que el plan no preveía:

- **El contenedor se elige por el que reinició**, no por el primero del pod. Con un sidecar (service mesh,
  agentes) el primero puede no ser el de Kwirth, y entonces se pediría el log anterior de otro proceso.
- **El About lee la sesión del `SessionContext`**, no de props. Se intentó pasarle `backendUrl` y
  `accessString` desde `App.tsx`, y el typecheck sacó el segundo llamante: el About se abre también desde
  las preferencias del canal magnify, donde no hay ninguno de los dos a mano.
- **El tipo de la respuesta se declara en los dos lados**, en el back y en `About.tsx`, en vez de
  compartirlo por `kwirth-common`. Es lo que ya hace el gestor de extensiones con las respuestas del core,
  y evita que cada campo nuevo arrastre una publicación.
- **El aviso se recuerda por la marca de tiempo de la muerte**, no por sesión ni por arranque: es el único
  dato que no cambia hasta que hay otro reinicio, así que recargar la SPA no repite el aviso y un reinicio
  nuevo sí lo trae.
- **El botón se queda visible y deshabilitado, con el motivo en el tooltip.** Un botón apagado y mudo es lo
  que hace pensar que el producto está roto; y hay tres motivos distintos por los que no hay log, que la
  guía documenta en una tabla.

## Backlog

- ✅ **Hecho el 2026-09-21: el core ya no muere por una promesa sin `catch` de una extensión.** Era el
  frente que este plan dejaba abierto: `exitAndLog()` se llevaba el pod por delante porque una extensión
  de terceros no atendió un rechazo. Ahora el fallo se **atribuye por el stack** —el core carga cada back
  desde `/tmp/kwirth-<tipo>-<id>-back.js`, así que ahí está su rastro— y si es de una extensión se aísla,
  se deja traza con su nombre y el core sigue sirviendo. La heurística es a propósito conservadora: lo que
  **no** se puede atribuir se sigue tratando como fallo del core y el proceso sale, porque ahí sí puede
  haber quedado un estado del que no conviene fiarse. En `tools/FailureOrigin.ts`, con 7 tests.
- ✅ **Hecho el 2026-09-21: `ProviderManager` ya cachea en `/tmp`** lo que baja, como plugin, sender y
  webhook. Y de paso se arregló el defecto del patrón que se iba a copiar: **ninguno de los cuatro
  invalidaba esa caché**. El nombre no lleva la versión —quien la lee al arrancar solo conoce el id—, así
  que una actualización seguía cargando el js viejo mientras el pod siguiera vivo, y `/tmp` sobrevive a
  reiniciar el proceso. Ahora se borra al instalar y al desinstalar, con el nombre en un solo sitio
  (`cachedExtensionFile` / `dropCachedExtensionFiles`) para que el borrado y la lectura no puedan
  divergir.
