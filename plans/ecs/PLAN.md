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

## S2 — Qué se observa desde ECS

**MVP**: la misma tarea de ECS, configurada, observa un cluster de Kubernetes externo; y en EC2 launch
type, los contenedores de su instancia.

| paso | qué |
|---|---|
| S2.1 | **Kubeconfig montado** (EFS o Secrets Manager): Kwirth en ECS observa un EKS externo. El código ya lo soporta; lo que falta es que la detección de ECS no lo impida y que la combinación quede nombrada. |
| S2.2 | **EC2 + `/var/run/docker.sock`**: qué se ve realmente y qué no. Depende de **D2**, porque el camino pasa por las ramas de `EClusterType.DOCKER` que hoy están muertas. |
| S2.3 | **Ingesta** como camino de Fargate: verificar de punta a punta FireLens → provider `fluentbit`, y OTLP → provider `otel`, desde otra tarea del mismo cluster ECS. |
| S2.4 | Credenciales AWS: rol de tarea (`taskRoleArn`) frente a variables de entorno, y qué necesita cada provider. |

**Checks**

- [ ] Desde ECS, un cluster EKS se lista y su log se sigue.
- [ ] EC2: los contenedores de la instancia aparecen; queda escrito que **es sólo esa instancia**, no el cluster ECS.
- [ ] Fargate: una segunda tarea con sidecar FireLens manda su log y se ve en el canal.
- [ ] ⛔ Ningún camino de prueba dispara senders ni webhooks reales.

**CL9** al terminar.

---

## S3 — El proyecto `ecs/`

**MVP**: `ecs/` contiene lo que hace falta para desplegar, y se despliega tal cual.

- Task definition **Fargate** (mínima, y una completa con EFS + Secrets Manager + ALB).
- Task definition **EC2** (con el bind-mount del socket, y la advertencia de su alcance).
- Plantilla **CloudFormation** con los recursos de alrededor: EFS, security groups, target group, roles
  de ejecución y de tarea con los permisos mínimos.
- Ejemplo de **FireLens** para el camino de ingesta de Fargate.
- `README.md` del proyecto: qué hay, qué elegir y en qué orden.

**Checks**

- [ ] Cada JSON/YAML valida con `node -e JSON.parse` (o el parser que toque) — no basta con que *parezca* bien.
- [ ] Los ejemplos no llevan credenciales, cuentas ni ARNs reales.
- [ ] Los permisos IAM son los mínimos, y cada uno tiene escrito para qué es.

**CL9** al terminar.

---

## S4 — Documentación

**MVP**: quien no conoce Kwirth despliega en ECS siguiendo la página, sin abrir el código.

- Página de ECS en `docs/0.6.31/`, colgada del sidebar, **en inglés** como el resto de la documentación.
- Tabla completa de variables de entorno relevantes en ECS, con qué hace cada una y qué pasa si falta.
- Las dos rutas (Fargate y EC2) con lo que cambia entre ellas, incluido lo que **no se puede** hacer en cada una.
- Actualizar [installation.md](../../docs/0.6.31/installation.md) y [persistence.md](../../docs/0.6.31/persistence.md), que hoy sólo contemplan Kubernetes, Docker y External.
- ⚠️ La documentación del core se sirve desde el tgz: editar el markdown **no basta**, hay que regenerar
  `kwirth.tgz` y reiniciar el back.

**Checks**

- [ ] Toda variable documentada existe de verdad en el código.
- [ ] Las capturas necesarias, hechas y verificadas (punto 4 de la CL9, no un extra).
- [ ] Revisado si esto invalida algo ya escrito en `installation.md` y `persistence.md`.

**CL9** al terminar.

---

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
