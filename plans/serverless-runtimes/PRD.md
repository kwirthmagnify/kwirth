# Serverless runtimes — Kwirth en Cloud Run y ACI, e identidad de instalación sin Kubernetes

> **Estado**: PRD escrito (2026-10-06). Sin código. Tipos validados por el usuario el 2026-10-06.
> **Tipo**: core, público. Índice: [plans/README.md](../README.md).
> **Viene de**: [ecs](../ecs/PLAN.md) (Kwirth ya arranca en ECS) y de que los plugins que persisten o
> federan por cluster necesitan una identidad estable cuando no hay cluster. Lo que se diseña sirve a
> **cualquier** plugin.

## 1. Qué es

Dos cosas que van juntas porque sin la primera la segunda no se puede probar:

1. **Que Kwirth arranque en Google Cloud Run y en Azure Container Instances (ACI)** con la misma imagen y
   **sin configurar nada** específico de la plataforma — igual que ya pasa en ECS.
2. **Que una instalación sin Kubernetes tenga una identidad estable** (`clusterInfo.id`), sacada de lo que
   la plataforma ya ofrece, **sin pedirle nada al cliente**.

## 2. El problema

### 2.1 Hoy Kwirth NO arranca en Cloud Run ni en ACI

`detectExecutionEnvironment()` ([ExecutionEnvironment.ts](../../back/src/tools/ExecutionEnvironment.ts))
reconoce desktop, Kubernetes, ECS (por `ECS_CONTAINER_METADATA_URI_V4`) y Docker (por `/.dockerenv`). En
Cloud Run y en ACI no hay ninguna de esas señales, devuelve `undefined` y el arranque termina:

```
Unsupported execution environment. Exiting...      (back/src/index.ts, process.exit(1))
```

Es el mismo agujero que tuvo Fargate hasta el plan `ecs`.

### 2.2 Sin Kubernetes, la identidad de la instalación es `''`

`clusterInfo.id` es el `uid` del namespace `kube-system` — estable de por vida, y es la clave que usan los
plugins para **persistir** (una fila por cluster), **estampar** datos (el id de lo que guardan lleva el
cluster) y **federar** (un miembro de un grupo de clusters se identifica por él). Sin API de Kubernetes se
queda vacío. Consecuencias:

- Dos instalaciones sin cluster que compartan base de datos escriben con **la misma clave vacía**: se pisan
  configuración, historial y decisiones, sin ningún error.
- En federación, dos instalaciones así son **indistinguibles**.

## 3. Objetivos y no-objetivos

**Objetivos**

- Arranque en Cloud Run y ACI con la imagen actual, cero configuración de plataforma.
- Identidad estable para ECS, Cloud Run, ACI y "cualquier otro sitio", **sin configurar nada**.
- Que el log diga **de dónde salió** la identidad, y que una generada se vea a simple vista.
- Kubernetes **no cambia**: sigue siendo el `uid` de `kube-system`.

**No-objetivos**

- Observar Cloud Run / ACI como infraestructura (eso es trabajo de providers y plugins).
- Ejemplos de despliegue completos para Cloud Run y ACI (van en su plan, como el `ecs/` de ECS).
- Migrar datos guardados con identidad vacía (dev: sin migraciones).

## 4. Diseño

### 4.1 Detección del entorno

| Entorno | Señal | Coste |
|---|---|---|
| Kubernetes, desktop, ECS, Docker | las de hoy, **sin cambios** | — |
| **Cloud Run** | `K_SERVICE` (parte del *container runtime contract*: siempre presente) | síncrono |
| **ACI** | **no tiene variable propia** → se pregunta al endpoint de identidad de Azure (`169.254.169.254/metadata/identity/oauth2/token`, cabecera `Metadata: true`) con **timeout de 1 s**. Responde → ACI | asíncrono, ≤1 s, **solo** si no casó nada antes |

El orden importa: la sonda de Azure va **la última** y solo cuando ninguna señal síncrona ha casado, para
que un Docker local o un Kubernetes no paguen el segundo.

⚠️ `169.254.169.254` es también el IMDS de AWS EC2 y el de GCP. La ruta y la cabecera son de Azure: en EC2
devuelve 404 y en GCP pide otra cabecera, así que no hay falso positivo — pero hay test para cada uno.

Cloud Run y ACI guardan su configuración como ECS: **ficheros cifrados** en `KWIRTH_STORE`, con aviso si no
es un volumen persistente.

### 4.2 Identidad de la instalación

Se resuelve **una vez** al arrancar y se guarda en `clusterInfo.id` cuando no hay Kubernetes:

| Dónde | `id` | Fuente (sin configurar nada) | `source` |
|---|---|---|---|
| Kubernetes | `uid` de `kube-system` (sin cambios) | API de Kubernetes | `kubernetes` |
| ECS | `aws:ecs:<cuenta>:<región>:<cluster>:<family>` | endpoint de metadatos de la tarea (`${ECS_CONTAINER_METADATA_URI_V4}/task` → ARN del cluster + `Family`) | `ecs` |
| Cloud Run | `gcp:run:<proyecto>:<región>:<servicio>` | metadata server (`project/project-id`, `instance/region`) + `K_SERVICE` | `cloudrun` |
| ACI con identidad gestionada | `azure:aci:<suscripción>:<grupo>:<container group>` | token de la identidad gestionada: `xms_az_rid` si es *user-assigned* (el recurso de origen), `xms_mirid` si es *system-assigned* | `azure-mi` |
| Cualquier otro caso | `uuid:<uuid v4>` | generado la primera vez y guardado en el almacén de Kwirth | `generated` |

Por qué **no** "cuenta + región" a secas (la idea original de T1b): dos Kwirth en la misma cuenta y región
colisionarían. Y por qué **no** el ARN de la tarea, el id de instancia o la revisión: cambian en cada
arranque. Los elegidos son **estables al reciclar** tareas, instancias y revisiones.

Un `uuid:` generado es estable **mientras el almacén lo sea**. Si `KWIRTH_STORE` no es un volumen, cada
arranque produce una identidad nueva y los datos guardados con la anterior quedan huérfanos → **aviso en el
log** en ese caso, explícito.

`name` (legible, para la UI): `ecs/<cluster>/<family>`, `run/<servicio>`, `aci/<container group>`,
`kwirth-<8 primeros del uuid>`.

### 4.3 Tipos (validados el 2026-10-06)

En `kwirth-common`:

```ts
// EExecutionEnvironment gana dos valores
CLOUD_RUN = 'cloudrun',
ACI = 'aci'

/** De dónde sale la identidad de la instalación. */
export enum EInstallationIdSource {
    KUBERNETES = 'kubernetes',
    ECS = 'ecs',
    CLOUD_RUN = 'cloudrun',
    AZURE_MANAGED_IDENTITY = 'azure-mi',
    GENERATED = 'generated'
}

export interface IInstallationIdentity {
    id: string                      // lo que va a clusterInfo.id
    name: string                    // legible, para la UI
    source: EInstallationIdSource
}
```

### 4.4 Testabilidad

Igual que `resolveEnvironmentCapabilities`: las sondas (variables de entorno, HTTP a los endpoints de
metadatos, lectura/escritura del fichero de identidad) se **inyectan**. Los tests simulan cada plataforma
sin estar en ella: respuesta de la tarea ECS, del metadata server de GCP, un token de Azure con `xms_mirid`
y con `xms_mirid`+`xms_az_rid`, un 404 de EC2 en `169.254.169.254`, timeouts, y el `uuid` que se
reutiliza en el segundo arranque.

## 5. Riesgos

- **El segundo de la sonda de Azure.** Solo lo paga un entorno que no casó con nada; aun así se mide y se
  dice en el log.
- **ACI sin identidad gestionada** → `uuid:`. Es la caída prevista, no un fallo; el log lo explica.
- ~~**Cloud Run escucha en `$PORT`.**~~ **No es un riesgo** (comprobado en S1, 2026-10-06): Kwirth ya lee
  `PORT` (`back/src/index.ts`, `envPort`), así que escucha donde Cloud Run le diga sin configurar nada.
- **Identidad que cambia** si el cliente renombra el cluster ECS, el servicio de Cloud Run o el container
  group: los datos guardados quedan con la identidad vieja. Es la consecuencia lógica de "sin configurar
  nada", y se documenta.
- **Cascada de publicación**: `kwirth-common` → core → los plugins que lo consuman.

## 6. Validación

- **Harness** con cada plataforma simulada (§4.4).
- **ECS real**: con una tarea de Fargate desplegada (el plan `ecs` ya tiene los ejemplos).
- **Cloud Run y ACI reales**: QA manual en esas plataformas. Sin acceso a ellas, el stream no se da por
  cerrado — queda con su QA pendiente, dicho en el plan.
