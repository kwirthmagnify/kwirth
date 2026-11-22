# Toolsets: la capacidad `EXEC` — PRD

> **ESTADO — 📝 BORRADOR** (2026-11-22), pendiente de validar. Documento de PRODUCTO; el cómo irá en el PLAN.

## Resumen

Un AI toolset puede declarar una capacidad nueva, **`ECapability.EXEC`**, y entonces sus tools reciben
**`host.exec`**: ejecutar un comando en un contenedor de un pod (lo que hace `kubectl exec`), con su stdin, y
recibir su salida y su código de salida. Sin declararla, no la reciben, como cualquier otra capacidad.

La primera consumidora es una tool que **escribe ficheros en el filesystem de un contenedor** (un toolset de
pago aparte). Lo que se pide al core es solo la capacidad; lo que se haga con ella es de cada toolset.

## El problema

`host.k8s` presta `coreApi`, `appsApi`, `networkApi` y `crdApi`. Con ellos se puede crear y cambiar casi
todo **en el API de Kubernetes**, pero no se puede tocar nada **dentro** de un contenedor: escribir un
fichero, leer uno que no esté en un volumen accesible, comprobar algo con un comando. El core sí sabe hacerlo
(`ClusterInfo.execApi`, que usan el canal `fileman` y las operaciones de Magnify), pero no se lo presta a los
toolsets.

## Requisitos

- **R1. Capacidad nueva `EXEC`** en `ECapability` (`kwirth-common-ai`). Se declara en `requires` como las
  demás, y el gestor de AI toolsets la enseña entre lo que necesita el toolset.
- **R2. `host.exec`** solo si se declara **y** el host tiene `execApi`. Si falta, `undefined`: la tool lo dice.
- **R3. Una fachada, no el cliente.** `host.exec.run(namespace, pod, container, command, options)` devuelve
  `{ exitCode, stdout, stderr, truncated }`. El comando es un **array** (sin shell implícito: quien quiera
  `sh -c` lo pide así). `options`: `stdin` (texto), `timeoutSeconds`.
- **R4. Límites del core**, que el toolset no puede saltarse: un **timeout** por defecto (30 s) con un máximo
  (120 s), y un **tope de salida** (1 MB entre stdout y stderr; lo que pase se corta y `truncated: true`).
- **R5. Traza de cada ejecución** por el mismo canal que el resto (`trace`), con el pod, el contenedor y el
  comando, y con el **consumidor** (`IToolContext.consumer`) para que se sepa en nombre de qué canal se
  ejecutó. El stdin **no** se traza (puede llevar contenido sensible): solo su tamaño.
- **R6. Sin cambio en los permisos**: el `exec` lo hace el ServiceAccount de Kwirth. Hace falta `pods/exec`
  (`create`); con un despliegue de solo lectura falla, y la fachada devuelve el 403 tal cual para que la tool
  lo diga.

## Lo que hay que decir en voz alta

- **`EXEC` es la capacidad más poderosa que se ha prestado nunca a un toolset.** Con ella, una tool puede
  ejecutar **cualquier cosa** en **cualquier** contenedor que alcance el ServiceAccount, sea cual sea la
  intención de su autor. Por eso es una capacidad **declarada** —el admin la ve antes de instalar y antes de
  conceder— y por eso los toolsets que la usen deben ser **pequeños y separados**, concedidos aparte.
- **La fachada limita tiempo y tamaño, no intención.** No hay lista blanca de comandos: no sería acotable
  sin romper casos legítimos. El control es la **concesión** (y el RBAC del ServiceAccount).
- Toca el contrato `common-ai` (campo nuevo, sin romper nada): publicar `kwirth-common-ai` y subirla en el core.

## Criterios de aceptación

1. Un toolset sin `EXEC` no recibe `host.exec`; con `EXEC`, sí.
2. `run` devuelve la salida y el código de salida reales; con stdin, el comando lo lee.
3. Un comando que excede el timeout se corta y lo dice; una salida mayor que el tope llega cortada con
   `truncated: true`.
4. Cada ejecución queda en la traza con pod, contenedor, comando y consumidor, sin el contenido del stdin.
5. Sin `pods/exec`, el error dice que falta ese permiso.
6. Tests unitarios en `common-ai`; documentado en la guía de AI toolsets (tabla de capacidades y aviso).
