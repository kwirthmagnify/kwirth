# ECS — plan

> **Estado**: sin empezar. **Bloqueado** por las decisiones abiertas del [PRD §6](PRD.md#6-decisiones-abiertas--a-validar-antes-de-escribir-código).
> **Tipo**: core, público. Índice: [plans/README.md](../README.md).

Append-only. Lo que se decida y lo que se descarte se queda escrito aquí, aunque luego cambie.

## Por qué este orden

Los ejemplos y la documentación son el entregable que se pidió, pero **no se pueden escribir primero**:
documentarían un despliegue que no arranca. El orden es al revés de lo que parece — primero se desbloquea
el arranque (S1), luego se comprueba qué se puede observar de verdad desde ahí (S2), y sólo entonces los
ejemplos y la guía describen algo que existe.

Cada stream cierra con su propia CL9 completa. **No hay fase de cierre acumulada.**

---

## S1 — Arranque sin Kubernetes ✅ (código completo el 2026-09-24, pendiente de QA manual)

**MVP**: una tarea de ECS (Fargate) con la imagen actual arranca, sirve el front, permite login y
persiste en EFS. Sin Kubernetes en ninguna parte, y **sin observar nada**: los canales autónomos
funcionan y eso ya es un despliegue completo.

| paso | qué |
|---|---|
| S1.1 | **Capacidades en un solo sitio.** Una función que, del entorno detectado más las comprobaciones reales (¿socket del CRI?, ¿kubeconfig utilizable?), devuelva qué hay a mano y dónde se persiste. Es la pieza central del modelo (D1): todo lo demás pregunta aquí en vez de repetir condiciones sobre `runningEnv`. |
| S1.2 | `getExecutionEnvironment()` aprende `ecs`: `ECS_CONTAINER_METADATA_URI_V4`, que el agente inyecta en **los dos** launch types. Va **antes** que la rama de Docker — en EC2 existe `/.dockerenv` y ganaría la partida. Escape por `FORCE`. |
| S1.3 | `common`: publicar el entorno de ejecución en `KwirthData` en vez de tirarlo tras el `switch`, y **`EClusterType.NONE`** (D1-bis). Publicar `common` y subir la dependencia en back y front — no hay alias de TS, el back consume el paquete publicado. |
| S1.4 | `clusterType` pasa a rellenarse **desde las capacidades**, no desde el entorno: hay API de kube → `KUBERNETES`, no la hay → `NONE`. |
| S1.5 | Retirada de Docker como fuente de recursos (D2): el enum, `DockerTools`, `dockerode`, las ramas de `index.ts`, `ConfigApi` y el front, y los nueve plugins que lo declaraban. |
| S1.6 | `createRunningInstance()` deja de exigir Kubernetes: sin kubeconfig utilizable no se construyen los clientes, no se llama a `readNamespace('kube-system')`, ni a `setKubernetesClusterName()`, ni a `getNodes()`. **No es un `try/catch` más ancho**: es una rama explícita, porque un `catch` que se traga el fallo convierte "no hay cluster" y "el cluster no responde" en el mismo silencio. |
| S1.7 | Almacenamiento según capacidades: fichero (`NodeSecrets` + `NodeConfigMaps`, cifrado con `MASTERKEY`) o ConfigMap/Secret. Hoy la rama de fichero existe pero vive detrás del `else` de Kubernetes ([index.ts:400](../../back/src/index.ts#L400)). |
| S1.8 | Identidad: `clusterName` de `KWIRTH_CLUSTER_NAME` o del metadata de ECS (cluster ARN / familia de tarea). |
| S1.9 | Healthcheck (**D4**): que el ALB tenga algo a lo que preguntar, siempre, no sólo `inCluster`. |
| ~~S1.10~~ | **Descartado.** Se llegó a filtrar canales por sus `sources` y a no registrar `events`/`metrics` sin API de kube. Se retiró: **el core no decide por los plugins**. Un plugin arranca encima y se conecta a lo que pueda, y `sources` no decidía nada en ninguna parte —el front sólo lo imprimía como texto— hasta que este filtro le dio un significado que no tenía. |
| S1.11 | Front: que `NONE` se entienda. [ResourceSelector.tsx:365](../../front/src/components/home/ResourceSelector.tsx#L365) decide el icono por la primera letra del valor, y [ManageClusters.tsx:80](../../front/src/components/home/ManageClusters.tsx#L80) lo enseña tal cual. Un Kwirth que no observa nada tiene que verse como lo que es, no como un desconocido. |
| S1.12 | Log de arranque: entorno detectado, capacidades resultantes y **por qué** cada una. Es la primera herramienta de diagnóstico de quien despliega esto. |

**Checks**

- [ ] Fargate sin nada montado: arranca, front servido, login de `admin`, la tarea pasa a *healthy* en el target group.
- [ ] Sin nada que observar, un **canal autónomo** arranca con la vista `none` y produce datos. Es el check que demuestra que el despliegue sirve para algo, no sólo que no se cae.
- [ ] Persiste de verdad: se crea un usuario, se recicla la tarea, el usuario sigue ahí.
- [ ] Sin `KWIRTH_STORE`: arranca igual, pero **avisa** de que no hay persistencia. No falla en silencio.
- [ ] `MASTERKEY` cambiada entre arranques: el fallo es explícito y explicado, no un 500 opaco.
- [ ] `docker compose` local: el canal de **log** funciona contra los contenedores, con los proyectos compose agrupados como "pods". Es el camino que estaba escrito y sin cablear, y en EC2 de ECS es exactamente el mismo.
- [ ] **Regresión**: los tres entornos de hoy (in-cluster, desktop, contenedor con kubeconfig) se comportan **exactamente** igual que antes. Es el riesgo real de S1, porque se toca el único camino de arranque que existe.

### Lo que se encontró al implementarlo

Tres cosas que el análisis previo no había visto y que habrían roto el arranque en Fargate:

1. **`loadFromDefault()` también había que meterlo dentro de la rama.** El plan sólo contemplaba no
   construir los clientes; pero cargar el kubeconfig, donde no hay ninguno, puede quejarse de que no hay
   contexto actual — y esa excepción cae en el mismo `catch` que dejaba a Kwirth sin instancia. El síntoma
   habría sido idéntico al que se quería arreglar.
2. **Había una segunda detección de entorno**, en `runningEnv`, con reglas parecidas pero no idénticas a
   las de `getExecutionEnvironment()`. Dos detecciones del mismo hecho acaban discrepando, así que ahora
   `runningEnv` se deriva de la única. De paso desapareció `isDocker`, que ya no consultaba nadie.
3. **Un segundo `switch` sobre el entorno**, el que elige qué arranque lanzar, con los mismos `case`
   muertos. `launchDocker` pasó a `launchStandalone` y lo comparten `docker` y `ecs`: siguen exactamente
   el mismo camino, y lo que cambia entre ellos son las capacidades, que ya vienen resueltas.

Y un defecto latente en el front: `getIcon()` decidía por la **primera letra** del tipo de cluster, así
que con `none` (`'n'`) no entraba en ninguna rama y **devolvía `undefined`**.

### Cómo se verificó

Sin ECS, levantando el back con el entorno forzado y almacenamiento en un directorio temporal:

| escenario | resultado |
|---|---|
| **UC1** dev normal (Kubernetes) | `executionEnvironment: kubernetes`, `clusterType: kubernetes`, los 11 canales arrancan. Sin regresión |
| **UC5** `docker run` con la imagen **anterior** | `clusterType: kubernetes`, busca `kube-system` en `localhost:8080` y acaba en `Cannot get a running instance`. El contenedor queda vivo pero devolviendo `503` — la prueba de que esa vía no estaba viva |
| ECS sin kubeconfig (Fargate) | `executionEnvironment: ecs`, `clusterType: none`, `/healthz` 200, y el usuario admin creado y **cifrado** en el volumen |

**UC2** (magnify desktop), **UC3** (Kwirth en docker con kubeconfig) y **UC4** (ECS con kubeconfig) no se
verificaron aquí a propósito: los tres exigen conectarse a un cluster real con los plugins cargados, y eso
puede disparar senders o webhooks de verdad. Van al QA manual.

**CL9**: el harness cubre la detección, las capacidades y el store (14 casos nuevos, con las dos
comprobaciones de máquina inyectadas para que no dependan de dónde se corra). El e2e cubre la parte
observable —el entorno publicado, `/healthz` fuera del cluster y la coherencia de los canales
anunciados— porque montar ECS en un e2e exigiría ECS.

---

## S2 — Qué se observa desde ECS · **absorbido por S3 y S4** (2026-09-24)

Este stream se queda sin contenido propio, y conviene dejar escrito por qué en vez de borrarlo:

- **S2.1 — kubeconfig montado**: ya verificado en S1. Un Kwirth con `FORCE=ecs` y un kubeconfig
  utilizable resuelve `clusterType: kubernetes` y los canales funcionan igual que in-cluster, porque la
  conexión es la misma API con las credenciales del kubeconfig. No hacía falta código nuevo.
- **S2.2 — socket del CRI en EC2**: **descartado** con D2. Docker deja de ser una fuente de recursos.
- **S2.3 — ingesta** y **S2.4 — credenciales AWS**: no son trabajo de core, son **configuración**. Su
  sitio natural son los ejemplos (S3) y la documentación (S4), que es donde alguien los va a buscar.

Lo que quedaba de verdad —FireLens apuntando al provider `fluentbit`, OTLP al provider `otel`, y el rol
de tarea frente a variables de entorno— pasa a S3 como ejemplos ejecutables.

---

## S3 — El proyecto `ecs/` ✅ (2026-09-24)

**MVP**: `ecs/` contiene lo que hace falta para desplegar, y se despliega tal cual.

- `README.md` — qué hay, qué elegir, y la configuración que ECS obliga a resolver.
- `task-definition-minimal.json` — lo mínimo que arranca. No persiste nada, y lo dice.
- `task-definition-fargate.json` — EFS, `MASTERKEY` por Secrets Manager, health check.
- `task-definition-ec2.json` — lo mismo en EC2, y **con un kubeconfig montado**, que es el caso de
  observar un cluster desde ECS.
- `cloudformation.yaml` — EFS con access point, security groups, target group, roles y log group. No
  crea VPC, cluster ni balanceador: eso ya existe y entra como parámetro.
- `firelens-sidecar.json` — cómo **otra** tarea manda su log a este Kwirth.

**Checks**

- [x] Cada JSON valida con `node -e JSON.parse`; el YAML, revisado (sin tabs, 279 líneas).
- [x] Sin credenciales, cuentas ni ARNs reales: sólo placeholders `<ACCOUNT_ID>`, `<REGION>`…
- [x] Permisos IAM mínimos y comentados: el rol de ejecución lee **una** secret, el de tarea monta EFS
      **a través del access point** y nada más.
- [x] El health check usa `wget`, **comprobado dentro de la imagen** (`/usr/bin/wget`; no hay `curl`).
- [x] La URI de ingesta de FireLens (`/provider/fluentbit`) comprobada contra el código —
      `routerAlias`, que el core monta como `/provider/<alias>`— y no escrita de memoria.
- [x] El tag de la imagen: documentado cómo se elige, con `latest` sólo en el ejemplo de prueba y
      versión fijada en los demás, explicando por qué `latest` en una task definition anula lo que una
      task definition sirve.

---

## S4 — Documentación ✅ (2026-09-24)

**MVP**: quien no conoce Kwirth despliega en ECS siguiendo la página, sin abrir el código.

Se hizo **sección dentro de `installation.md`**, no página aparte: ECS es una forma más de instalar, y
quien busca cómo desplegar va a esa página. Así no hay que tocar el sidebar ni partir en dos la
información de instalación.

- `installation.md` — sección *ECS: kwirth as an AWS task*, entre Docker y External. Qué deja de dar la
  plataforma (store e identidad), qué observa según lo que se monte, y el log de arranque como primera
  herramienta de diagnóstico. Y *Docker & External* pasa a *Docker, ECS & External*.
- `persistence.md` — ECS en la tabla de modos, y la consecuencia que en ECS es **el caso por defecto**:
  sin `KWIRTH_STORE` en un volumen, el store muere con la tarea.
- **Website** (`docs/*.html`, que es otra cosa que la documentación versionada): pestaña **AWS ECS** en
  la sección de instalación de `index.html`, y `aitoolsets.html` corregido — decía que a un toolset no
  se le entrega "the Docker client", que ya no existe.
- `kwirth.tgz` regenerado, porque la guía se sirve desde ahí y editar el markdown no basta.

**Checks**

- [x] Las 9 variables documentadas existen en el código, comprobado una a una con `process.env.<X>`.
- [x] La pestaña del website **verificada en un navegador**, no supuesta: aparece, se activa, muestra su
      panel y oculta el de Helm. Y de paso se corrigió el subtítulo, que prometía *"just one Helm
      command"* con una pestaña de ECS al lado.
- [x] **Ninguna captura afectada**, y no por omisión: `isDocker` era siempre falso en todo entorno real
      —`clusterType` sólo podía valer `kubernetes`—, así que los `disabled={… || isDocker}` no
      deshabilitaban nada y quitarlos no cambia un píxel. El icono de `none` sólo sale en un Kwirth sin
      cluster, que antes no podía existir.
- [x] Revisado qué quedaba **falso** en la documentación, no sólo qué faltaba: el ejemplo de canal
      autónomo, y las páginas de `fileman`, `echo` y `news`, que prometían funcionar sobre Docker.

---

## S5 — Documentación de Docker ✅ (2026-09-24)

No estaba en el plan. Sale de que S1 cambió el modo Docker sin querer: un contenedor **sin kubeconfig**
pasó de no arrancar a ser una forma válida de correr Kwirth, y la carpeta `docker/` llevaba tiempo sin
que nadie la mirase.

Lo que la revisión encontró:

| hallazgo | qué se hizo |
|---|---|
| `kwirth-users` y `kwirth.keys` **versionados en el repo público**, con un admin de contraseña `asd`, scope `cluster::::` y 12 access keys. Están ahí porque `docker-launch.cmd` monta la propia carpeta como `CONFIGMAPPATH` y `SECRETPATH` | fuera de git y a `.gitignore`, contenido reemplazado. Las 12 claves ya caducaron en abril y `cleanApiKeys()` las tiraba al arrancar, así que no aportaban nada operativo |
| La sección *Get started [Docker]* del readme de Docker Hub dice literalmente **`+++pending`** | **no tocado**, fuera del alcance acordado. Queda anotado: es lo primero que ve quien encuentra la imagen |
| `CONFIGMAPPATH` y `SECRETPATH` valen `.` por defecto, que en la imagen es `/usr/kwirth/dist` — la capa escribible del contenedor | documentado como la trampa principal: funciona perfectamente hasta el `docker rm` |
| En modo Docker los secretos se escriben **en claro**, al contrario que en Kubernetes con `KWIRTH_STORE`, desktop y ECS | documentado, con la consecuencia: `MASTERKEY` firma API keys pero **no cifra nada aquí** |
| Los cuatro scripts son `.cmd` de Windows; no hay equivalente para Linux ni macOS | **no se añadieron**, fuera del alcance acordado. El README da el `docker run` de las dos plataformas |
| Dos readmes de Docker Hub divergidos (`jfvilas` y `kwirthmagnify`) | anotado, sin tocar |

Entregado: [`docker/README.md`](../../docker/README.md), y la sección *Docker* de `installation.md`
reescrita — documentaba un `docker run` **sin store**, que es exactamente el fallo que se describe.

## Pendiente al cerrar el proyecto

- **Publicar el back.** Lleva el bump de `kwirth-common` a `0.5.56` en su `package.json` desde el
  2026-09-24, pero su publish en npm se hace **al terminar ECS**, no stream a stream. Decisión del
  2026-09-24.
- **Corrida e2e completa.** Aplazada el 2026-09-24 para agruparla con otros cambios: tarda ~33 min y dos
  tandas se invalidaron por reinicios del back en mitad. Los 4 casos del spec nuevo sí pasan.
- **`agora` no compila**, por `EInfraSource.CLOUD` —que el enum no declara— en `azureSignals.ts` y su
  test. Es trabajo previo, ajeno a esto, y quedó **aparcado por decisión del usuario**. Mientras no
  compile no se puede reconstruir su `dist`, así que seguirá mostrando el hueco en sus `sources`.
- **Actualizar los plugins instalados.** Publicar no actualiza lo que un Kwirth tiene puesto: en el dev,
  `log` seguía en 0.2.23 y por eso mostraba `[,kubernetes]`. Hay que actualizarlos desde el gestor.

## Hallazgos laterales, al backlog

- **Actualizar un plugin no refresca lo que el core ANUNCIA de él.** En `onPluginInstalled`
  ([index.ts:1400](../../back/src/index.ts#L1400)) la entrada de `kwirthData.channels` sólo se añade
  `if (!...some(c => c.id === id))`. Eso vale para una instalación nueva; en una **actualización** el id
  ya está y la entrada vieja se queda, con los `sources` y los flags de la versión anterior. El módulo
  del back sí se recarga —lo que no se recompone es el anuncio—, así que hace falta reiniciar el core y
  **nada lo avisa**, porque el aviso depende de que el plugin declare `requiresRestart` y esto le pasa a
  cualquiera. Lo destapó el usuario actualizando `log` a 0.2.24: seguía anunciando `[,kubernetes]` hasta
  reiniciar. Arreglo probable: reemplazar la entrada en vez de saltarla.

- Las entradas de **docs** en el manifest privado se llaman `Kwirth <X> — Guide`, pero el criterio de los
  artefactos de pago es `IRIA <Producto> — Guide`. Visto al clonar las entradas de spectrum, sugarless y
  asteroids; **no se tocó** para no cambiar naming publicado de paso.

## Publicaciones hechas

| fecha | artefacto | versión | por qué |
|---|---|---|---|
| 2026-09-24 | `kwirth-common` | 0.5.55 | `EExecutionEnvironment`, `EClusterType.NONE` y el campo `executionEnvironment` |
| 2026-09-24 | `kwirth-common` | 0.5.56 | `EClusterType.DOCKER` retirado del enum (D2) |
| 2026-09-24 | `log` 0.2.24 · `alert` 0.2.25 · `status` 0.2.2 · `news` 0.2.24 · `sender-debug` 0.1.1 · `echo` 0.2.24 · `mirc` 0.1.14 · `fileman` 0.2.24 · `provider-debug` 0.1.5 | — | los nueve declaraban `DOCKER` en sus `sources`; `log` y `alert` además tenían `startDockerStream()`. npm + manifest público |
| 2026-09-24 | `spectrum` 0.4.3 · `sugarless` 0.2.3 · `asteroids` 0.1.7 | — | lo mismo, en los privados. Nexus + manifest privado, **plugin y docs en lockstep** |

## Riesgos

| riesgo | por qué importa | qué se hace |
|---|---|---|
| S1 toca el **único** camino de arranque | una regresión ahí rompe los tres entornos que hoy funcionan, y se nota en producción, no en el dev | la rama sin Kubernetes es explícita, nunca un `catch` más ancho; regresión de los tres entornos antes de cerrar S1 |
| No hay ECS en el entorno de desarrollo | nada de esto se valida en local | unitarios para la lógica de detección y almacenamiento; el QA manual de ECS lo hace el usuario en su cuenta |
| `EClusterType.DOCKER` muerto (**D2**) | S2.2 pisa código que nadie ejecuta desde hace tiempo | decidir D2 antes de S2, no durante |
| Expectativa de "sólo documentación" | el encargo pedía un proyecto sencillo, y S1 es trabajo de core | está escrito en el PRD §2 con las líneas de código que lo demuestran |
