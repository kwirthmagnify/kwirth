# Despliegue de Kwirth sin permisos de escritura

> **Estado (2026-10-08): entregado y validado en k3d. Vivo por el backlog de abajo.**
> `deploy/kubernetes/manifests/kwirth-readonly.yaml` y `kwirth-full-ro.yaml`, con 19 tests unitarios y
> 75 comprobaciones e2e contra el API server. Guía actualizada (`docs/0.6.31/installation.md`). Queda el
> backlog: el token proyectado, el reloj del metrics provider sin token, y el RBAC del chart de Helm.

## Por qué

El usuario pidió «un yaml de despliegue de Kwirth, basado en el que tenemos en `deploy/kubernetes/manifests`,
que sea un despliegue con un único yaml pero con mínimos privilegios, idealmente solo lectura».

Lo que había no era mínimo ni de lejos. `kwirth.yaml` concede `resources: ['*'], verbs: ['*']` sobre doce
grupos de API —o sea `create` y `delete` sobre **todos los Secrets del clúster**, más `exec` y `delete`
sobre cualquier cosa— y el que estaba desplegado en el k3d de dev era aún más ancho
(`apiGroups: ["", "*"]`), es decir cluster-admin entero.

## Lo entregado

Dos manifiestos de un solo fichero, cada uno aplicable con un `kubectl apply -f`:

| fichero | objetos | permiso de clúster | escrituras | métricas de kubelet |
|---|---|---|---|---|
| `kwirth-readonly.yaml` | 9 | `get`/`list`/`watch` sobre todo | **1**: un token para su propio SA | sí |
| `kwirth-full-ro.yaml` | 7 | `get`/`list`/`watch` sobre todo | **ninguna** | no |

Los dos llevan el store en un **PVC** (`KWIRTH_STORE=/data`), `EXITLOG=false`, y el pod con
`drop: [ALL]`, sin escalada de privilegios, `readOnlyRootFilesystem` y un `emptyDir` en `/tmp`.

### Decisiones, y qué se descartó

**La seguridad vive en los VERBOS, no en los recursos.** Es lo que hace legítima una regla comodín:
abrir una shell es `create` sobre `pods/exec` y desalojar es `create` sobre `pods/eviction`, así que
tres verbos de lectura los deniegan igual de bien que no nombrar el recurso. Comprobado contra el API
server con `kubectl auth can-i`, no deducido.

**Enumerar se escribió, se desplegó y se descartó.** La primera versión nombraba 45 recursos uno a uno,
con los Secrets fuera a propósito. Al desplegarla en k3d salieron **156 líneas de watcher en Forbidden**:
el events provider abre un watcher por **cada CRD que ve aparecer**
(`EventsProvider.handleEvent` → `startCrdInstanceWatcher`), sin que ningún suscriptor lo pida, y qué CRDs
tiene un clúster **no se puede saber al escribir el manifiesto** — en un k3d de serie con Rancher y
Kubewarden eran 37 grupos. Con la regla comodín, **0**.

No se tiró: vive comentada en la cabecera de cada fichero entre marcadores `STRICT-RULES`, y **los tests
la parsean del comentario y la verifican como si fuera código**, porque es un consejo que damos.

**El precio, que no se esconde: los Secrets se leen.** RBAC no resta —no hay reglas de denegación ni
forma de decir «todos los grupos menos el core»—, así que o enumeras (y los CRDs desconocidos quedan
fuera por construcción) o pones comodín (y entran los Secrets). No hay tercera. El e2e **afirma ese
`yes`** para que nunca sea una sorpresa. Pesa menos de lo que suena: con cualquiera de estos manifiestos
Kwirth ya lee el log de **todos** los pods y **todos** los ConfigMaps.

**El PVC es la otra mitad del privilegio mínimo**, no un detalle de persistencia. Dentro de Kubernetes
el store de Kwirth *es* ConfigMaps y Secrets de su namespace, y eso obliga a escritura. Apuntando
`KWIRTH_STORE` a un volumen montado esa escritura desaparece entera, y con ella el Secret `kwirth-users`
del fichero: con store en fichero el back siembra el admin él solo (`createAdminUserIfMissing`).

**La diferencia entre los dos ficheros es UNA decisión**: el `Role` namespaced con una única regla
—acuñar un token para su propio SA, con `resourceNames: ['kwirth-sa']`—, que es como el metrics provider
llega al kubelet. Un test exige que los dos ClusterRole sean **idénticos**, para que no se separen por
accidente.

### Hallazgos del camino

- 🔴 **`readNodeMetrics` lee DOS rutas del kubelet**, autorizadas contra subrecursos distintos:
  `/metrics/cadvisor` → `nodes/metrics` y `/stats/summary` → `nodes/stats`. Conceder solo la primera no
  degrada las métricas de nodo: las **rompe**, porque `readCAdvisorSummary` lanza excepción si la
  respuesta no es `ok`. Con `resources:['*']` el problema no existía.
- 🔴 **`kubectl auth can-i get pods/log` no pregunta por el subrecurso**: pregunta por el pod *llamado*
  `log`, que `get pods` ya permite. Tres comprobaciones del e2e pasaban en vacío hasta que `nodes/proxy`
  cantó un `yes` imposible. Van todas con `--subresource`.
- ⚠️ **`EXITLOG` viene a `true`** y en un crash el back escribe un ConfigMap `kwirth-secure-log`; sin
  permiso es un 403, y el `catch` **espera una hora** antes de terminar en vez de dejar que el Deployment
  lo reinicie (`index.ts`).
- ⚠️ **Cinco env vars muertas en `kwirth.yaml`**: `CHANNEL_LOG`, `CHANNEL_ALERT`, `CHANNEL_OPS`,
  `CHANNEL_TRIVY`, `CHANNEL_ECHO`. El back solo lee `CHANNEL_METRICS` y `CHANNEL_MAGNIFY`
  (`index.ts:217-218`); los demás canales son plugins desde hace tiempo.
- ⚠️ **A `kwirth.yaml` le faltan tres grupos** que Magnify sí lista —`node.k8s.io`, `scheduling.k8s.io`
  y `admissionregistration.k8s.io`—, así que esas ramas del árbol dan 403 hoy sin decirlo.
- ⚠️ **La MASTERKEY cambia de naturaleza** con el store en fichero: pasa a cifrarlo, y `NodeSecrets.read`
  se traga cualquier error y devuelve el default, así que cambiarla después del primer arranque no da
  error — deja de descifrar, Kwirth no ve usuarios y recrea `admin`/`password`.

### QA

Desplegados los dos en el k3d de dev, en namespaces propios y con la imagen local (`KWIRTH_IMAGE`, para
no probar otra build), sin tocar la instalación existente. PVCs `Bound`, 0 reinicios, 0 Forbidden,
0 errores de métricas en `readonly`, el `401: Unauthorized` esperado en `full-ro`, y el 403 de Magnify
al crear un pod confirmado por el usuario desde la UI. Todo borrado al acabar.

## Backlog

| # | qué | por qué importa |
|---|---|---|
| B1 | **Leer el token proyectado** (`/var/run/secrets/kubernetes.io/serviceaccount/token`) en vez de llamar a `createToken`, con caída al `TokenRequest` si el fichero no está | Arregla un **bug latente que ya sufre el despliegue permisivo**: `createToken` se llama una sola vez al arrancar, caduca a los 7 días y `clusterInfo.token` no se refresca nunca (`index.ts:428-432`), así que a la semana las métricas por kubelet se caen en silencio hasta reiniciar. El token proyectado lo **rota el kubelet**. Y de paso dejaría a `full-ro` con métricas **sin dejar de ser 100% RO**. Probado a mano dentro del pod: 3814 líneas de cAdvisor con ese token. Dos consumidores: `MetricsProvider` y el provider `suse-longhorn` |
| B2 | **No arrancar el reloj del metrics provider cuando no hay token** | Hoy `CHANNEL_METRICS=false` apaga el **canal**, no el **provider**, que conserva su tick de 15 s: `full-ro` loguea un `401` por nodo y por tick, para siempre. Una línea |
| B3 | **RBAC del chart de Helm** — ver [`plans/helm/PLAN.md`](../helm/PLAN.md) | El «RBAC explícito» del chart `0.2.0` sigue siendo `resources:['*'], verbs:['*']`; lo único configurable es la lista de grupos. La vía de instalación recomendada sigue siendo cluster-admin con otro nombre mientras los manifiestos ya no lo son |
| B4 | **Limpiar `kwirth.yaml`**: quitar las cinco env muertas y añadir los tres grupos que faltan | Son dos erratas que confunden a quien copia el manifiesto para adaptarlo |
| B5 | **`test/kwirth.yaml` ≠ `deploy/kubernetes/manifests/kwirth.yaml`** (97 líneas frente a 129), y la guía apunta al de `test/` | Quien siga la guía despliega un fichero distinto del que mantenemos. Decidir cuál es el bueno y que la guía apunte ahí |
| B6 | **`EXITLOG`: no esperar una hora** cuando la escritura del ConfigMap falla | Un fallo de permisos no debería retrasar el reinicio del pod una hora; hoy se tapa poniendo `EXITLOG=false` |
