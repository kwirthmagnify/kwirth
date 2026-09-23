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

## S1 — Arranque sin Kubernetes

**MVP**: una tarea de ECS (Fargate) con la imagen actual arranca, sirve el front, permite login y
persiste en EFS. Sin Kubernetes en ninguna parte, y **sin observar nada**: los canales autónomos
funcionan y eso ya es un despliegue completo.

| paso | qué |
|---|---|
| S1.1 | **Capacidades en un solo sitio.** Una función que, del entorno detectado más las comprobaciones reales (¿socket del CRI?, ¿kubeconfig utilizable?), devuelva qué hay a mano y dónde se persiste. Es la pieza central del modelo (D1): todo lo demás pregunta aquí en vez de repetir condiciones sobre `runningEnv`. |
| S1.2 | `getExecutionEnvironment()` aprende `ecs`: `ECS_CONTAINER_METADATA_URI_V4`, que el agente inyecta en **los dos** launch types. Va **antes** que la rama de Docker — en EC2 existe `/.dockerenv` y ganaría la partida. Escape por `FORCE`. |
| S1.3 | `common`: publicar el entorno de ejecución en `KwirthData` en vez de tirarlo tras el `switch`, y **`EClusterType.NONE`** (D1-bis). Publicar `common` y subir la dependencia en back y front — no hay alias de TS, el back consume el paquete publicado. |
| S1.4 | `clusterType` pasa a rellenarse **desde las capacidades**, no desde el entorno: hay socket → `DOCKER`, hay API de kube → `KUBERNETES`, ninguna → `NONE`. Con esto se enciende el **cable 1** de D2 y el camino de contenedores deja de estar cortocircuitado. |
| S1.5 | **Cable 2** de D2: instanciar `clusterInfo.dockerApi` y `clusterInfo.dockerTools` cuando hay socket. Hoy no los asigna nadie y el primer `dockerTools.getAllPods()` reventaría. |
| S1.6 | `createRunningInstance()` deja de exigir Kubernetes: sin kubeconfig utilizable no se construyen los clientes, no se llama a `readNamespace('kube-system')`, ni a `setKubernetesClusterName()`, ni a `getNodes()`. **No es un `try/catch` más ancho**: es una rama explícita, porque un `catch` que se traga el fallo convierte "no hay cluster" y "el cluster no responde" en el mismo silencio. |
| S1.7 | Almacenamiento según capacidades: fichero (`NodeSecrets` + `NodeConfigMaps`, cifrado con `MASTERKEY`) o ConfigMap/Secret. Hoy la rama de fichero existe pero vive detrás del `else` de Kubernetes ([index.ts:400](../../back/src/index.ts#L400)). |
| S1.8 | Identidad: `clusterName` de `KWIRTH_CLUSTER_NAME` o del metadata de ECS (cluster ARN / familia de tarea). |
| S1.9 | Healthcheck (**D4**): que el ALB tenga algo a lo que preguntar, siempre, no sólo `inCluster`. |
| S1.10 | Canales y providers de Kubernetes (**D5**): `metrics` y `events` no se arrancan si no hay API de kube, y el log de arranque lo dice con todas las letras. |
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

**CL9** al terminar. Los e2e de S1 necesitan decidirse: el arranque en ECS no es reproducible en el dev local, así que el harness cubre la **detección** y la **selección de almacenamiento** por unitarios, y el e2e cubre la regresión de los entornos existentes.

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

## Riesgos

| riesgo | por qué importa | qué se hace |
|---|---|---|
| S1 toca el **único** camino de arranque | una regresión ahí rompe los tres entornos que hoy funcionan, y se nota en producción, no en el dev | la rama sin Kubernetes es explícita, nunca un `catch` más ancho; regresión de los tres entornos antes de cerrar S1 |
| No hay ECS en el entorno de desarrollo | nada de esto se valida en local | unitarios para la lógica de detección y almacenamiento; el QA manual de ECS lo hace el usuario en su cuenta |
| `EClusterType.DOCKER` muerto (**D2**) | S2.2 pisa código que nadie ejecuta desde hace tiempo | decidir D2 antes de S2, no durante |
| Expectativa de "sólo documentación" | el encargo pedía un proyecto sencillo, y S1 es trabajo de core | está escrito en el PRD §2 con las líneas de código que lo demuestran |
