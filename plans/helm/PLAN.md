# Helm chart de Kwirth — revisión y puesta al día

> **Estado (2026-10-09): chart `0.3.0` publicado, con TRES modos de instalación.**
> `normal` (gestiona el clúster), `readonly` (lo observa y no lo cambia) y `zero` (ni sabe que está en
> uno). Más la MASTERKEY generada y la contraseña de admin generada y mostrada al instalar. **46 tests
> unitarios y 77 comprobaciones e2e** contra k3d, con los tres modos instalados de verdad. El QA del
> `0.2.x`, parado en su gate desde el 28/09, se hizo por fin de camino.
> ⚠️ El chart se publicó con `appVersion 0.6.65` y el tag por defecto `develop`: ese tag tiene que llevar
> un core con los arreglos del 2026-10-08 y el `CONTAINER` del 09, o el modo `zero` no arranca y el login
> de los otros dos da 401 (rechazan el bcrypt `$2a$` que escribe el chart).

## Por qué

Los charts tenían meses (el último, `0.1.5`, decía `appVersion 0.4.235`; el core va por `0.6.3x`) y la
forma de versionarlos y publicarlos era manual y frágil. El usuario pidió revisarlos, comprobar que fueran
correctos, analizar versionado y publicación, y completarlos con todo lo que tiene Kwirth ahora.

## Diagnóstico (lo que había)

### Layout y publicación

- **Una carpeta por versión** (`deploy/helm/0.1.0` … `0.1.5`), copias completas. `publish-chart.cmd`
  reempaquetaba **las seis** en cada publicación y regeneraba el índice entero; los tgz viejos cambiaban de
  `created` en cada corrida.
- **`docs/helm-charts/index.yaml` estaba editado a mano**: `0.1.5` aparecía **dos veces** con el mismo
  digest y dos `appVersion` distintos (`0.4.235` en el Chart.yaml, `0.5.21` en el índice); las entradas
  `0.1.0`–`0.1.4` apuntaban a `jfvilas.github.io` (el dominio viejo).
- El script apuntaba a `kwirthmagnify.github.io/kwirth/helm-charts`; el sitio vive en `kwirthmagnify.dev`
  (Pages redirige, pero el índice debe llevar la URL canónica).
- `deploy/index.yaml` era un resto vacío.
- **La documentación daba mal la URL del repo**: `installation.md` y el `README.md` del repo decían
  `helm repo add kwirth https://github.com/kwirthmagnify/kwirth/tree/master/deploy/helm`, que no es un
  repo Helm. La correcta: `https://kwirthmagnify.dev/helm-charts`.

### Errores del chart 0.1.5

1. 🔴 **El Secret de usuarios se llamaba `<release>-users`**, pero el core lee **`kwirth-users`** por nombre
   fijo en su namespace y, en Kubernetes, **no lo crea si falta**. Con cualquier release que no se llamara
   `kwirth`, nadie podía hacer login.
2. 🔴 **`image: kwirthmagnify/kwirth:latest`** por defecto, y en Docker Hub **`latest` se quedó en abril**
   (`0.5.x`), mientras las versiones numeradas van por `0.6.38`. Toda instalación nueva recibía un Kwirth de
   cinco meses.
3. Seis variables de canal muertas (`CHANNEL_LOG/ALERT/OPS/TRIVY/ECHO/FILEMAN`): el core solo lee
   `CHANNEL_METRICS` y `CHANNEL_MAGNIFY`; el resto son plugins. Y `channelMagnify` estaba en `values.yaml`
   pero **no** en el deployment.
4. `MASTERKEY` en claro en el pod spec.
5. ClusterRole `*`/`*` (cluster-admin), cuando los manifests ya lo habían acotado a una lista de grupos.
6. El `Service` seleccionaba solo por `app: kwirth`: dos releases en un namespace se cruzaban.
7. Sin `KWIRTH_STORE`, sin `KWIRTH_SQL_*`, sin `KWIRTH_LICENSE`, sin `KWIRTH_CLUSTER_NAME`, sin `PORT`,
   `BODYLIMIT`, `KEEPALIVE`, `PREVIOUSLOGLINES`, `AUTH`, `FRONT`, `ANSILOG`, `EXITLOG`; sin `extraEnv`
   (los IdP resuelven `${VAR}` contra el entorno), sin PVC, sin `imagePullSecrets`, `nodeSelector`,
   `tolerations`, `affinity`, `securityContext`, `podAnnotations`.
8. Ingress: `path: {{ rootpath }}` sin fallback a `/` (rootpath vacío = Ingress inválido); AGIC sondeaba `/`
   en vez de `/healthz`; `roleRef.apiGroup: ""` (funciona por defaulting, pero es incorrecto).
9. Sin tests de ningún tipo.

## Decisiones

- **Una única fuente**: `deploy/helm/kwirth/`, versión en `Chart.yaml`. Un tgz publicado es inmutable;
  `publish-chart.mjs` se niega a reempaquetar una versión ya publicada.
- **Versionado**: `version` (chart, SemVer) independiente de `appVersion` (imagen probada, y tag por
  defecto). Propuesta de tag git: `chart/kwirth@<version>`. Ojo: no es un `EExtensionType`, es un tipo
  propio para el chart.
- **Compatibilidad con values 0.1.x**: mismas claves bajo `kwirth.*`; `image` acepta string (pull
  `Always`, como antes) u objeto; `sa.serviceAccount.annotations` sigue valiendo; las claves muertas se
  ignoran. Los **nombres de recursos** se mantienen (`<fullname>`, `-sa`, `-cr`, `-crb`, `-svc`, `-ing`)
  y el **selector del Deployment no cambia** (es inmutable): `helm upgrade` desde 0.1.5 funciona.
- **Secret de usuarios y ConfigMap de keys**: nombre fijo, `helm.sh/resource-policy: keep`, y en cada
  upgrade se re-renderizan **desde el objeto vivo** (`lookup`) solo si pertenecen a la release; si no
  existen, se crean con el admin de bootstrap. Así el upgrade es un no-op sobre ellos y el uninstall los
  conserva. Motivo de no usar hooks: al pasar de 0.1.5 el Secret está en el manifest viejo, y dejar de
  renderizarlo lo **borraría**.
- **Secretos por Secret**: `MASTERKEY`, `KWIRTH_LICENSE`, `KWIRTH_SQL_PASSWORD` van en `<fullname>-env`
  (o en `existingSecret`), vía `envFrom`.
- **RBAC explícito por defecto** (la lista de los manifests + los grupos que el back instancia:
  admissionregistration, node, scheduling, events, discovery), con `clusterAdmin`, `extraApiGroups` y
  `extraRules` para providers con CRDs.
- **Persistencia**: `persistence.*` crea/monta un PVC y fija `KWIRTH_STORE`; `sql.*` apunta a un Postgres
  externo (el chart no lo despliega, coherente con `persistence.md`).
- **Ingress unificado**: `nginx` | `agic` | `generic`, con `className`, `annotations` (las del usuario ganan)
  y `tls` genérico. Los valores de anotación se stringifican (`--set` convierte `"10"` en número).

## Streams

| stream | qué | estado |
|---|---|---|
| S1 | chart `0.2.0` + tests unitarios (23) + e2e contra clúster + publish script + READMEs | ✅ construido |
| S2 | guía: `installation.md` (opciones, URL del repo, persistencia con `persistence.*`) y `README.md` del repo | ✅ hecho (2026-10-08), ampliado con lo de abajo |
| S3 | publicar: `publish-chart.mjs`, commit de `docs/helm-charts`, tag, push | ⬜ **pendiente**, bloqueado por `appVersion` |
| S4 | **modo `readonly`** (chart `0.3.0`): una regla `get/list/watch`, store en PVC obligatorio, `exitLog` y `users.bootstrap` derivados, securityContext endurecido y `/tmp`. Y cuatro combinaciones que el chart **se niega a renderizar** | ✅ hecho y QA pasado |
| S5 | **MASTERKEY generada** en su propio Secret `keep`, con lookup en upgrade y reinstall, y la ruta de migración desde el Secret de entorno de charts anteriores | ✅ hecho y QA pasado |
| S6 | **contraseña de admin generada y mostrada** en las notas de instalación, guardada como `bcrypt(sha256())` y con la clave del Secret en base64url como la escribe el core | ✅ hecho y QA pasado |
| S7 | **modo `zero`**: un pod sin un solo permiso de Kubernetes. Ni RBAC ni ServiceAccount, token proyectado apagado, `FORCE=container` y los canales de clúster en false. Se niega a renderizar si le piden RBAC | ✅ hecho y QA pasado (2026-10-09) |

## Backlog

- Retirar `deploy/helm/0.1.0`…`0.1.5` y `deploy/helm/publish-chart.cmd`, `deploy/index.yaml` (borrado
  bloqueado en la sesión; lo hace el usuario).
- `deploy/manifests/kwirth.yaml` y `test/kwirth.yaml` siguen con `image: latest` y las variables de canal
  muertas: misma revisión que el chart, en otro stream.
- Mover `latest` en Docker Hub con cada release (o dejar de documentarlo).
- e2e de la **migración real desde 0.1.5** (release `kwirth`): no se puede correr en el dev porque el
  Kwirth de manifests ya ocupa `kwirth-cr`; se prueba en un k3d limpio.
- `values.schema.json` para validar tipos en `helm install`.
- PodDisruptionBudget y NetworkPolicy opcionales.
