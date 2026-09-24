# ECS — Kwirth desplegado en AWS Elastic Container Service

> **Estado**: borrador. Sin código. Pendiente de validar las decisiones abiertas (§6).
> **Tipo**: core, público. Índice: [plans/README.md](../README.md).

## 1. Qué es

Kwirth corriendo como **tarea de ECS**, en los dos launch types (**Fargate** y **EC2**), con **la misma
imagen** que ya se publica. ECS es la **plataforma de hosting**; *qué* observa Kwirth ahí no lo decide ECS,
lo deciden los providers y la configuración: un cluster de Kubernetes (con su kubeconfig), un proveedor
cloud, otros servicios del propio ECS, o nada de eso y sólo ingesta entrante.

**Y "nada" es una respuesta válida.** Un Kwirth puede arrancar sin observar ninguna infraestructura y
seguir siendo útil: los **canales autónomos** —los que declaran `cluster:false` y `resourced:false` y
arrancan con la vista `none` ([Channel.ts:41](../../common/src/Channel.ts#L41))— no miran al cluster, viven
de una API externa o de lo que les entre por un provider. Eso no es un caso degradado a tolerar: es un
despliegue de primera clase, y en ECS va a ser frecuente.

El entregable tiene dos mitades y conviene no confundirlas:

- **El proyecto `ecs/`** — ejemplos de despliegue ejecutables (task definitions, CloudFormation/Terraform,
  parámetros) y la documentación, **con el foco en la configuración**.
- **Lo que hay que desbloquear en el core** para que ese despliegue sea posible, porque hoy no lo es.

## 2. El problema: hoy Kwirth no arranca en ECS

No es una carencia de documentación, es un bloqueo de arranque. Verificado en el código:

| # | hecho | dónde |
|---|---|---|
| 1 | La detección de entorno devuelve `desktop \| kubernetes \| docker \| undetected`, y `undetected` hace `process.exit()`. **ECS no existe como entorno.** | [back/src/index.ts:237](../../back/src/index.ts#L237) |
| 2 | `isDocker` se decide por `/.dockerenv`. En **Fargate** no existe (es containerd), así que Fargate cae en `undetected` y el proceso muere. | [back/src/index.ts:140](../../back/src/index.ts#L140) |
| 3 | `createRunningInstance()` monta **siempre** un `KubeConfig` y hace `readNamespace('kube-system')`. Sin un cluster alcanzable eso lanza, cae al `catch` y **no se crea ninguna instancia**. | [back/src/index.ts:300](../../back/src/index.ts#L300), [:344](../../back/src/index.ts#L344) |
| 4 | Detrás de ese `readNamespace` vienen `setKubernetesClusterName()` y `getNodes()`, también contra la API de Kubernetes. | [back/src/index.ts:361](../../back/src/index.ts#L361) |
| 5 | El modo "docker" documentado **no es** "Kwirth observando Docker": es *Kwirth en un contenedor con el kubeconfig montado*, y su `clusterType` es `KUBERNETES`. | [back/src/index.ts:2822](../../back/src/index.ts#L2822), [installation.md:145](../../docs/0.6.31/installation.md#L145) |
| 6 | `EClusterType.DOCKER` es **código inalcanzable**: sólo lo producen los `case 'windowsdocker'/'linuxdocker'`, que la detección nunca devuelve. | [back/src/index.ts:2812](../../back/src/index.ts#L2812) |

Resumen: **todo camino de arranque presupone hoy un cluster de Kubernetes alcanzable**. Un despliegue en
ECS que sólo quiera observar cloud, o sólo recibir ingesta, no tiene por dónde arrancar.

## 3. Para quién

- Quien **no tiene Kubernetes** y quiere Kwirth igualmente: ECS es su plataforma de contenedores.
- Quien **sí tiene EKS** pero prefiere que el observador viva fuera del cluster observado — separar el
  plano de observación del plano observado es una decisión de arquitectura legítima, y en ECS es barata.
- Quien quiere un **punto de ingesta** en AWS: FireLens/Fluent Bit, OTLP, syslog y HTTP entran por
  providers que ya existen ([fluentbit](../../providers/fluentbit/README.md),
  [otel](../../providers/otel/README.md), [syslog](../../providers/syslog/README.md),
  [http-pull-push](../../providers/http-pull-push/README.md)).

## 4. Qué tiene que pasar para que esto sea un producto

### 4.1 Arranque

Kwirth arranca en ECS **aunque no haya Kubernetes en ninguna parte**, y lo dice claro en el log de
arranque: qué plataforma detectó, qué puede observar y qué no. Si hay kubeconfig, lo usa y observa ese
cluster exactamente como hoy. Si no lo hay, no es un error: es una configuración válida.

### 4.2 Configuración — el foco

Es donde se juega el producto. Lo que un despliegue de ECS necesita resolver, y que en Kubernetes venía
resuelto por el propio cluster:

| asunto | en Kubernetes | en ECS |
|---|---|---|
| **persistencia** | Secrets/ConfigMaps del namespace, o PVC con `KWIRTH_STORE` | **EFS** montado, con `KWIRTH_STORE` apuntando ahí. Sin volumen no hay persistencia: al reciclar la tarea se pierde todo (usuarios, claves, extensiones instaladas) |
| **cifrado en reposo** | igual | `MASTERKEY` **obligatoria** y estable — si cambia, los secretos ya escritos dejan de leerse ([persistence.md:45](../../docs/0.6.31/persistence.md#L45)) |
| **secretos de arranque** | Secret del namespace | Secrets Manager / SSM Parameter Store vía `secrets[]` de la task definition |
| **identidad del cluster** | detectada del cluster | `KWIRTH_CLUSTER_NAME`, o derivada del metadata de ECS |
| **exposición** | Service + Ingress | ALB + target group; `ROOTPATH` si cuelga de un path |
| **puerto** | 3883 | 3883; `awsvpc` en Fargate obliga a puerto igual en host |
| **healthcheck** | `/healthz` sólo si `inCluster` ([index.ts:2921](../../back/src/index.ts#L2921)) | hace falta un healthcheck que exista **siempre**, o el target group nunca pone la tarea en healthy |

### 4.3 Qué puede observar desde ECS

- **Kubernetes** — con kubeconfig montado (EFS o Secrets Manager). Los canales funcionan **exactamente
  igual** que en un Kwirth in-cluster: la conexión es por la API de Kubernetes con las credenciales del
  kubeconfig, y eso es transparente para ellos. El core no hace nada especial.
- **Nada** — y es una configuración completa, no un arranque a medias: el front se sirve, los usuarios
  entran, los canales autónomos funcionan, los providers de ingesta reciben, y desde ahí se **federa**
  contra otro Kwirth. Es el caso que hoy es imposible, porque el arranque exige un cluster.
- **Cloud** — vía los providers correspondientes, con las credenciales que cada uno pida. Un plugin
  arranca y se conecta a lo que pueda; eso no es asunto del core.

> **Lo que NO hace**: gestionar las tareas o los contenedores de ECS como recursos propios. Ver **D2**.

### 4.4 Documentación y ejemplos

El proyecto `ecs/` entrega ejemplos que se despliegan tal cual, no fragmentos ilustrativos, y la
documentación explica **por qué** cada parámetro está donde está — no describe pantallas.

## 5. Fuera de alcance

- Un **provider de ECS** que descubra tareas/servicios por la API de AWS y los presente como recursos
  observables. Es un producto en sí mismo; si se quiere, va a su propio PRD.
- CloudWatch Logs como origen (no hay provider que lo lea).
- ECS Anywhere, EKS sobre Fargate, App Runner.
- Cualquier cambio en el front más allá de que no se rompa cuando no hay Kubernetes.

## 6. Decisiones — tomadas el 2026-09-23

**D1. Un eje, y capacidades derivadas de él. ✅ Validado.**

Se descartó la idea inicial de modelar dos ejes en paralelo ("dónde corre" y "qué observa"). El segundo
**no decide nada**: el core no necesita saber qué hay al otro lado para arrancar, necesita saber qué tiene
a mano. Un eje que no cambia ningún comportamiento sólo da trabajo de mantener.

El eje bueno **ya existe**: `getExecutionEnvironment()`
([index.ts:237](../../back/src/index.ts#L237)) calcula dónde corremos. Lo que pasa hoy es que su
resultado **se tira** en cuanto termina el `switch` ([index.ts:2792](../../back/src/index.ts#L2792)): no
se guarda en ninguna parte, y lo único que sobrevive son cuatro campos derivados y peor informados
(`clusterType`, `inCluster`, `isDesktop`, `namespace`).

El modelo queda en tres piezas, y el orden importa:

1. **Entorno de ejecución** — un valor, el que ya se detecta, enriquecido con `ecs`. Se **publica** en
   `KwirthData` en vez de tirarse. Su papel es informativo y de diagnóstico.
2. **Capacidades** — lo que de verdad decide, derivado del entorno **más comprobaciones reales** al
   arrancar: ¿hay socket del CRI?, ¿hay un kubeconfig utilizable?, ¿dónde se persiste?
3. **`clusterType`** — se rellena **desde las capacidades**, no desde el entorno. Sigue significando lo
   que ya significaba para quien lo lee (`DOCKER` → contenedores, `KUBERNETES` → pods), así que el front
   y `ConfigApi` no se enteran del cambio.

La clave es la 2: **el entorno no basta**, porque un contenedor puede traer socket, kubeconfig, los dos o
ninguno, y hoy la detección no los distingue — resuelve el empate siempre a favor del kubeconfig. Esa es
la razón de que el camino de Docker esté muerto (ver D2).

Las capacidades se derivan en **un único sitio**, y el resto del core pregunta ahí. Hoy esas condiciones
están repartidas entre `runningEnv.isDesktop`, `runningEnv.isDocker`, `kwirthData.inCluster` y
`clusterType` a lo largo de todo el arranque, y esa dispersión es lo que hace que añadir un entorno nuevo
sea un trabajo de riesgo.

| entorno | API de Kubernetes | store |
|---|---|---|
| `kubernetes` (in-cluster) | sí, no es opcional | ConfigMap/Secret |
| `docker` | si hay kubeconfig | fichero (formato histórico) |
| `desktop` | kubeconfig local | fichero cifrado |
| `ecs` (los dos launch types) | si hay kubeconfig | fichero cifrado (EFS) |

> El socket del CRI no aparece en esta tabla: ver **D2**. Los cuatro entornos observan un cluster o no
> observan nada, y en los dos launch types de ECS la respuesta es la misma — lo que cambia entre Fargate
> y EC2 no afecta a lo que Kwirth puede hacer.

> **D1-bis. `EClusterType` gana `NONE`.** Hace falta de verdad: en Fargate sin socket y sin kubeconfig no
> hay ni contenedores ni pods, y declararse `KUBERNETES` haría que el front saliera a listar pods contra
> nada. Afecta a [ResourceSelector.tsx:365](../../front/src/components/home/ResourceSelector.tsx#L365),
> que decide el icono por la **primera letra** del valor (`'d'` → Docker, `'k'` → Kubernetes).

**D2. Docker deja de ser una fuente de recursos, y se retira. ✅ Decidido el 2026-09-24.**

> Esta decisión **sustituye** a la anterior, que era revivir `EClusterType.DOCKER` dándole detección real.
> Se mantiene escrita abajo porque explica lo que se encontró, y porque el estado del código era lo que
> llevó a proponerlo.

Kwirth **no va a gestionar contenedores ni proyectos de `docker compose` como si fuesen un cluster**.
Docker sigue siendo un sitio **donde correr** —eso lo dice `EExecutionEnvironment`—, y desde ahí se
federa contra otro Kwirth o se apunta a un cluster montando un kubeconfig, que es el caso paralelo a ECS.

Se comprobó **empíricamente** que esa vía no estaba viva, con un `docker run` sobre la imagen publicada:

```
"clusterName": "inDocker",
"clusterType": "kubernetes",        ← no 'docker'
FetchError: request to http://localhost:8080/api/v1/namespaces/kube-system failed
Cannot get a running instance
```

El contenedor se queda vivo escuchando en el 3883 pero **sin instancia**: cualquier petición responde
`503`. Es el peor modo de fallo, porque parece arrancado.

Por qué no podía funcionar, y son dos motivos independientes:

1. **Nadie producía `EClusterType.DOCKER`.** Sólo salía de los `case 'windowsdocker'/'linuxdocker'`, que
   la detección no devolvía nunca; el `'docker'` que sí se detectaba asignaba `KUBERNETES`.
2. **Nadie asignaba `clusterInfo.dockerApi` ni `dockerTools`.** Estaban declarados con `!` y no había un
   solo `new DockerTools(...)` en el back.

Lo que sí estaba escrito —y era bueno— es que **`dockerTools` no era código muerto del core: era API que
el core ofrecía a los plugins**. Los canales `log` y `alert` tenían su `startDockerStream()` completo,
eligiendo por `clusterInfo.type`. Esa es la parte que se retira.

Alcance de la retirada: `EClusterType.DOCKER` fuera del enum (`common` 0.5.56), `DockerTools.ts` borrado,
`dockerode` fuera de las dependencias del back, `watchDockerPods()` y las ramas de `index.ts` y
`ConfigApi.ts` eliminadas, `dockerApi`/`dockerTools` fuera de `ClusterInfo`, las ramas `isDocker` del
`ResourceSelector` del front, y los **nueve plugins** que declaraban `DOCKER` en sus `sources` —`log` y
`alert` además con su `startDockerStream()`.

**D3. Detección de ECS: señal canónica + escape.** `ECS_CONTAINER_METADATA_URI_V4`, que el agente inyecta
en **los dos** launch types, más `FORCE=ecs` para poder forzarlo. La comprobación va **antes** que la de
Docker: en EC2 launch type existe `/.dockerenv` y ganaría la partida.

**D4. `/healthz` siempre.** Deja de estar atado a `inCluster`. Es un endpoint sin coste y sin información
sensible, y sin él el target group de un ALB nunca pone la tarea en *healthy* — el modo de fallo es un
despliegue que se recicla en bucle sin decir por qué.

**D5. Sin Kubernetes no se arrancan los canales ni los providers de Kubernetes.** `metrics` y `events` se
quedan fuera, y el log de arranque lo dice con todas las letras. Dejarlos fallar en su `start()` habría
sido más barato, pero convierte cada arranque normal en una pila de errores — y entonces un error de
verdad ya no se distingue.
