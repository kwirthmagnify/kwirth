# Toolsets: la capacidad `EXEC` — PLAN

> **ESTADO — 🚧 EN CURSO** (2026-11-22). PLAN y tipos de §2 validados por el usuario. **E2 hecho** (pendiente
> de QA): `GET /core/aitoolsets` devuelve `capabilities` (no `requires`: en los gestores esa palabra son las
> dependencias entre extensiones) y la tarjeta muestra un chip rojo `exec`. **E1 hecho**:
> `kwirth-common-ai@0.5.82` publicada (fachada probada también contra el `Exec` real del k3d en un pod
> propio). Producto en el [PRD](PRD.md).
>
> Añadido en E1 sobre el plan: un fallo que no es exit code del comando (binario inexistente, imagen
> distroless sin `sh`) solo viene en el mensaje del `Status`, y la fachada lo pasa a `stderr` cuando el comando
> no escribió nada; si no, la tool no podría decir por qué.

## 1. Dónde vive

Todo en **`kwirth-common-ai`**: `buildToolHost` ya recibe el `clusterInfo` del consumidor, que es el
`ClusterInfo` del core y ya trae `execApi` (`back/src/model/ClusterInfo.ts`, el mismo que usa `fileman`). El
back del core **no cambia** salvo subir la dependencia.

## 2. Tipos nuevos (a validar por el usuario)

| tipo | dónde | forma |
|---|---|---|
| `ECapability.EXEC` | `common-ai/src/index.ts` (valor nuevo) | `EXEC = 'exec'` |
| `IExecOptions` | `common-ai/src/back.ts` | `{ stdin?: string, timeoutSeconds?: number }` |
| `IExecResult` | `common-ai/src/back.ts` | `{ exitCode: number, stdout: string, stderr: string, truncated: boolean, timedOut: boolean }` |
| `IExecCapability` | `common-ai/src/back.ts` | `{ run(namespace: string, pod: string, container: string, command: string[], options?: IExecOptions): Promise<IExecResult> }` |
| `IToolHost.exec` | `common-ai/src/back.ts` (campo nuevo, opcional) | `exec?: IExecCapability` |

## 3. La fachada (`buildToolHost`)

- Solo si `requires` incluye `EXEC` **y** `clusterInfo.execApi` existe (R2).
- `run` llama a `execApi.exec(ns, pod, container, command, stdout, stderr, stdin, false, onStatus)`:
  - stdout/stderr a `Writable` que acumulan hasta **1 MB entre los dos**; lo que pase se descarta y
    `truncated: true` (R4);
  - stdin: el texto como `Readable`, o `null`;
  - `exitCode` desde el `V1Status` del callback (`Success` → 0; `NonZeroExitCode` → la causa `ExitCode`);
  - **timeout**: 30 s por defecto, máximo 120 s (lo que pida la tool se recorta); al vencer se cierra el
    socket y vuelve `timedOut: true`;
  - un 403 al abrir el socket se **lanza** tal cual (con su `code`), para que la tool lo traduzca (R6).
- **Traza** (R5): `context.trace('exec', { namespace, pod, container, command, stdinBytes, consumer })`. Nunca
  el stdin.

## 4. Streams

| stream | qué | tests |
|---|---|---|
| **E1. common-ai** | tipos de §2, fachada de §3; publicar `kwirth-common-ai@0.5.82` | unit con un `execApi` falso: sin `EXEC` no hay `host.exec`; salida y exit code; stdin; tope → `truncated`; timeout → `timedOut`; 403 lanzado; traza sin stdin |
| **E2. core** | subir `common-ai` en back y front; el gestor muestra `exec` entre lo que necesita un toolset (comprobar que el front pinta cualquier capacidad, no una lista cerrada); guía (tabla de capacidades + aviso) y changelog | e2e: un toolset de prueba con `EXEC` sale en el gestor diciendo que lo necesita |

E1 y E2 van antes que `k8s-files`, que depende de ellos.
