# Cómo funciona

Pinocchio es un **canal** de kwirth. Cuando lo abres, el backend arranca una instancia del canal que se
**suscribe a tres providers** y se queda escuchando. Cada evento que llega se compara con tus **triggers**;
si encaja, se construye una llamada al LLM y el resultado vuelve a tu pantalla.

## El bucle completo

```
   +---------------------+
   |  events (k8s)       |--- ADDED / MODIFIED / DELETED de Pod, Deployment, ...
   +---------------------+
   |  business (HTTP)    |--- POST /provider/business  {space, type, data}
   +---------------------+
   |  metrics            |--- NO dispara nada: alimenta el contexto de las tools
   +---------------------+
              |
              v
   +---------------------+     ¿hay un trigger cuyo tipo, kind y evento
   |  match de triggers  |     encajen? ¿tiene una version enabled?
   +---------------------+
              |  si
              v
   +---------------------+     system  = version.system
   |  render del prompt  |     prompt  = nunjucks(version.prompt, objeto)
   +---------------------+              o  JSON.stringify(objeto)
              |
              v
   +---------------------+     el modelo puede llamar a tools (list_namespaces,
   |  LLM + tools        |     get_pod_logs, get_rollout_history, ...) hasta
   +---------------------+     agotar `steps`
              |
              v
   +---------------------+     findings[] + resource + PSS + score_summary +
   |  salida estructurada|     global_risk + next_steps + report
   +---------------------+
              |
              v
   +---------------------+
   |  tu pestaña         |     y se guarda en el back (ultimos 50 analisis)
   +---------------------+
```

## Los tres providers

Al arrancar el canal, Pinocchio se suscribe a:

| Provider   | Para qué lo usa                                                                  |
|------------|----------------------------------------------------------------------------------|
| `events`   | **Dispara** los triggers de tipo `artifact`. Escucha los kinds de la lista de abajo. |
| `business` | **Dispara** los triggers de tipo `business`, y es también el canal por el que el Playground inyecta eventos. |
| `metrics`  | **No dispara nada.** Se guarda un buffer de las últimas 100 lecturas que se pasa como contexto a las tools de uso (`get_cluster_usage`, `get_prev_node_usage`, …). |

Los kinds que escucha el provider `events` están fijados en el plugin:

`Pod`, `Deployment`, `DaemonSet`, `StatefulSet`, `ReplicaSet`, `Job`, `CronJob`,
`ReplicationController`, `Service`, `Ingress`, `HTTPRoute`

De la suscripción a `business`, el canal sólo pide tres pares espacio/tipo:
`customers.status`, `branches.status` y `launch.immediate`. Esto importa y se explica en
[El Playground](06-playground.md).

## Qué NO se analiza al arrancar

Cuando abres el canal, Kubernetes reemite como `ADDED` **todos** los objetos que ya existen. Si Pinocchio
los analizase, una sola apertura del canal costaría cientos de llamadas al modelo.

Para evitarlo, ante un `ADDED` el canal compara el `metadata.creationTimestamp` del objeto con la hora de
arranque del canal: si el objeto es **anterior**, lo descarta y deja una traza de aviso en el log del
backend. Sólo se analiza lo que nace **después** de que el canal esté escuchando.

> Consecuencia práctica: si quieres analizar algo que ya existe, no te vale con abrir el canal. Recrea el
> recurso, provoca un `MODIFIED`, o usa el [Playground](06-playground.md) pegando su YAML/JSON a mano.

## Dónde vive el estado

| Qué                          | Dónde                                                                |
|------------------------------|----------------------------------------------------------------------|
| Triggers y estado del Playground | Almacén del canal, clave `pinocchio-config`                       |
| Providers de IA (con las API keys) | Almacén **común** de kwirth, `kwirth-ai-providers` (Secret)     |
| LLMs                         | Almacén **común** de kwirth, `kwirth-ai-llms` (ConfigMap)             |
| Análisis producidos          | Sólo en **memoria** del canal, los últimos 50                        |

Los dos almacenes comunes los comparte Pinocchio con el resto de plugins de kwirth que usan IA: no son
suyos. Ver [Providers y modelos de IA](../admin/02-ai-config.md).

Los análisis **no se persisten**. Al reconectar, el back te reenvía de golpe los que tenga en memoria; si el
backend se reinicia, se pierden.
