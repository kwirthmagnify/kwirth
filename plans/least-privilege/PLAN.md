# Despliegue de Kwirth sin permisos de escritura

> **Estado (2026-10-08): entregado. Vivo por el backlog de abajo (queda B3).**
> `deploy/kubernetes/manifests/kwirth-full-ro.yaml`: **un** manifiesto de solo lectura, con métricas, y
> sin un solo verbo de escritura. 8 tests unitarios del manifiesto + 41 comprobaciones e2e contra el API
> server, y 11 tests del back por B1/B2. Documentado en docsify (`docs/0.6.31/installation.md`) y en el
> website (`getting-started.html`, `index.html`). **B1, B2, B4, B5 y B6 cerrados**; queda **B3**, el RBAC
> del chart de Helm.

## Por qué

El usuario pidió «un yaml de despliegue de Kwirth, basado en el que tenemos en `deploy/kubernetes/manifests`,
que sea un despliegue con un único yaml pero con mínimos privilegios, idealmente solo lectura».

Lo que había no era mínimo ni de lejos. `kwirth.yaml` concede `resources: ['*'], verbs: ['*']` sobre doce
grupos de API —o sea `create` y `delete` sobre **todos los Secrets del clúster**, más `exec` y `delete`
sobre cualquier cosa— y el que estaba desplegado en el k3d de dev era aún más ancho
(`apiGroups: ["", "*"]`), es decir cluster-admin entero.

## Lo entregado

**Un** manifiesto de un solo fichero, `kwirth-full-ro.yaml`, 7 objetos, aplicable con un
`kubectl apply -f`: `get`/`list`/`watch` sobre todo y **ninguna** escritura, en ningún sitio. Store en
un **PVC** (`KWIRTH_STORE=/data`), `EXITLOG=false`, y el pod con `drop: [ALL]`, sin escalada de
privilegios, `readOnlyRootFilesystem` y un `emptyDir` en `/tmp`.

> **Hubo un segundo manifiesto y duró unas horas.** `kwirth-readonly.yaml` llevaba un `Role`
> namespaced con una única regla —acuñar un token para su propio SA— porque se creía que era la única
> forma de que el metrics provider llegara al kubelet, y `kwirth-full-ro.yaml` era ese mismo fichero
> sin esa regla y, por tanto, sin métricas. **B1 lo dejó sin sentido**: leyendo el token que Kubernetes
> ya proyecta en el pod, el acceso al kubelet no cuesta permiso alguno, así que la regla no hacía
> nada en un clúster con el automount por defecto. Dos ficheros que se diferencian en una regla inerte
> son dos ficheros que alguien tiene que mantener y explicar, así que se borró el de más.

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

**Las métricas no cuestan permiso, y eso fue el hallazgo que simplificó todo** (B1). El token para
hablar con el kubelet se **lee** de la proyección que Kubernetes monta en el pod y que el kubelet rota,
no se pide al API server. Un test del manifiesto vigila que `automountServiceAccountToken` siga en su
`true` por defecto: ponerlo a `false` parecería un endurecimiento más y costaría las métricas en
silencio.

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

| # | qué | estado |
|---|---|---|
| B1 | **Leer el token proyectado** (`/var/run/secrets/kubernetes.io/serviceaccount/token`) en vez de pedir uno al API server, con caída al `TokenRequest` si no hay fichero | ✅ **hecho (2026-10-08)**. Arregla un bug latente que **también sufría el despliegue permisivo**: `createToken` se llamaba una vez al arrancar, caducaba a los 7 días y `clusterInfo.token` no se refrescaba nunca, así que a la semana las métricas por kubelet se caían en silencio hasta reiniciar. Ahora el token se **relee** (caché de 60 s) y lo rota el kubelet. 🔴 `ClusterInfo.token` pasa a ser un **getter**: así cada consumidor —incluidos los plugins, que no cambian— recibe uno fresco sin tocar una línea. Y de paso dejó el manifiesto sin su única escritura, lo que borró el segundo fichero. 8 tests |
| B2 | **No arrancar el reloj del metrics provider cuando no hay token** | ✅ **hecho (2026-10-08)**. `CHANNEL_METRICS=false` apaga el **canal**, no el **provider**, que conservaba su tick de 15 s: un `401` del kubelet por nodo y por tick, para siempre. Ahora `startProvider` avisa una vez y no arranca. El desktop es la excepción: allí el kubelet se alcanza con las credenciales del kubeconfig y no hay token de por medio. 3 tests |
| B3 | **RBAC del chart de Helm** — ver [`plans/helm/PLAN.md`](../helm/PLAN.md) | ⬜ **pendiente**. El «RBAC explícito» del chart `0.2.0` sigue siendo `resources:['*'], verbs:['*']`; lo único configurable es la lista de grupos. La vía de instalación recomendada sigue siendo cluster-admin con otro nombre mientras el manifiesto ya no lo es |
| B4 | **Limpiar `kwirth.yaml`**: quitar las cinco env muertas y añadir los tres grupos que faltan | ✅ **hecho (2026-10-08)**. Fuera `CHANNEL_LOG`, `CHANNEL_ALERT`, `CHANNEL_OPS`, `CHANNEL_TRIVY` y `CHANNEL_ECHO`, que no las leía nadie; dentro `CHANNEL_MAGNIFY`, que sí se lee y faltaba; y `node.k8s.io`, `scheduling.k8s.io` y `admissionregistration.k8s.io`, sin los cuales esas ramas del árbol daban 403 sin decirlo. 15 grupos |
| B5 | **`test/kwirth.yaml` ≠ `deploy/kubernetes/manifests/kwirth.yaml`**, y la guía apuntaba al de `test/` | ✅ **hecho (2026-10-08)**. El de `test/` tiene 97 líneas frente a 129 y **ni siquiera lleva Service**: quien seguía la guía se quedaba sin él. La guía y el website apuntan ya al de `deploy/`; el de `test/` se queda donde está, como lo que es, un fixture entre otros diez. De paso: el comando de la **portada daba 404** (`releases/latest/download/kwirth.yaml`, que no existe como asset de release) y `getting-started.html` tenía el `kubectl apply -f \` duplicado |
| B6 | **`EXITLOG`: no esperar una hora** cuando la escritura del ConfigMap falla | ✅ **hecho (2026-10-08)**. Convertía un fallo de permisos en una hora de caída, porque el Deployment no puede levantar el pod hasta que el proceso muere — y con un rol de solo lectura ese write falla **siempre**. Ahora se registra el error y se termina; el post-mortem está en el log del pod igualmente, que es donde mira `kubectl logs --previous` |

## Hallazgo lateral: el error de SQL que no decía de quién era

Apareció haciendo el QA de este despliegue, en un Kwirth sin base de datos:
`[sql] Acquire connection error: AggregateError [ECONNREFUSED]:` y dos frames de `node:net`, sin hora,
sin nivel, sin componente y sin decir quién se conectaba. Arreglado en el mismo cierre, en tres sitios:

- **El core no enganchaba `setSqlLogger`**, que existe desde hace tiempo. Ahora la salida de `common-sql`
  va por `ELogComponent.STORAGE`, y un *pool timeout* sale como ERROR y no como el WARNING que knex dice.
- **`describeError` no desenvolvía nada**, porque knex no le pasa un `Error` sino una **cadena ya
  formateada con el stack dentro**. Ahora se corta en el primer frame y se aplana a una línea.
- 🔴 **El «quién» podía mentir.** `setSqlLogger` instala **un** logger para todo el proceso y agora lo
  pisa con su prefijo, así que con ese plugin cargado todos los mensajes de SQL salían como suyos. Un
  logger global no puede saberlo; el cliente de knex, que se crea **por pool**, sí. Cada pool etiqueta
  ahora sus líneas, y `ensureDb` dice antes de intentar nada quién pide qué y contra qué servidor.

Y la causa de fondo, que es la que quita el ruido: el core **siempre** configuraba SQL, con `localhost`
por defecto. No existía «no configurado», así que un Kwirth sin base de datos tenía una apuntada a
`localhost:5432` y el control de uso de IA se comía un ECONNREFUSED en cada arranque. Sin
`KWIRTH_SQL_HOST` ya no se configura. `@kwirthmagnify/kwirth-common-sql` a **0.3.1**.
