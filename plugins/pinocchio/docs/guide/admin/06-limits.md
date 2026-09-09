# Límites conocidos

Lista honesta de lo que Pinocchio **no** hace, o hace de forma distinta a la que su UI sugiere. Todo lo de
esta página está verificado contra el código del plugin, no supuesto. Si algo te está pasando y aparece
aquí, no es tu configuración.

## Configuración de IA

**La config de IA sólo se lee al arrancar el canal.** Los providers y los LLMs se cargan del almacén común en
el arranque de la instancia. Si un administrador crea un provider desde los menús *AI Providers* del core con
el canal ya abierto, ese canal no lo verá hasta que se cierre y se reabra.
*Workaround:* configúralo desde el propio menú **Config** de Pinocchio, que sí notifica al canal, o reabre el
canal.

**La config de IA no viaja entre clústeres.** Los menús *AI Providers* / *AI Models* del core escriben en el
backend **local**, pero un canal abierto contra otro kwirth lee el almacén de **ese** clúster. En una
federación hay que configurar providers y LLMs en cada clúster.

**Las opciones de salida estructurada se eligen por el `Name` del provider, no por su `Type`.** El modelo se
construye bien (por tipo), pero los `providerOptions` (`structuredOutputs`, `strictJsonSchema`) se deciden con
un `switch` sobre el nombre. Un provider de tipo `google` llamado `gemini-prod` pierde el
`structuredOutputs: true` y sus triggers `artifact` pueden empezar a fallar.
*Workaround:* deja el `Name` del provider igual que su `Type`.

## Triggers

**El campo `Action` no está implementado.** El selector ofrece `inform`, `cancel` y `repair`, y el valor se
guarda en la configuración, pero el backend **nunca lo lee**. Todo se comporta como `inform`: se analiza y se
informa. Pinocchio no bloquea ni repara nada.

**El campo `Spaces` no filtra nada.** En un trigger `business` puedes escribir `orders.created`, pero el
matching no lo usa: **todos** los triggers `business` con una versión activa se disparan con **cualquier**
evento de negocio que llegue al canal. El único filtrado real es el de la suscripción del canal, que está
fijada en el código a `customers.status`, `branches.status` y `launch.immediate`.

**Los prompts `business` se renderizan con contexto vacío.** El backend calcula un objeto con los datos de los
espacios declarados… y luego llama a `nunjucks.renderString(prompt, {})`. Los datos del evento **no llegan a
la plantilla**: cualquier `{{ variable }}` sale como cadena vacía.

**Los triggers `business` ignoran el `system` de la versión.** El backend usa un system fijo
(*"Use the tools provided to find information…"*). El `system` que escribas en el editor se guarda pero no se
envía al modelo.

## Playground

**`Export → New trigger` pierde el `Kind` y el `K8s Event`.** El trigger nuevo se crea con el tipo y la
versión, pero sin `kind` ni `k8sEvent`. Un trigger `artifact` recién exportado **no casa con ningún evento**.
*Workaround:* abre **Config → Trigger** justo después y ponle el kind a mano.

**El selector `K8s Event` del Playground no hace nada.** El objeto que inyectas siempre se le entrega al
modelo como un evento `ADDED`. El valor se guarda con el estado del Playground, pero no cambia la simulación.

**En modo Artifact, el `Prompt type` que elijas no siempre manda.** El backend lo deriva de si el campo Prompt
tiene texto: con prompt, `jinja`; vacío, `artifact`.
*Workaround:* para probar `artifact` puro, vacía el campo Prompt.

**En modo Business, el payload es el prompt.** El backend descarta el campo `Prompt` y usa el contenido del
textarea de evento como prompt.

**En modo Business, cambiar `Space`/`Type` desvía el disparo.** Sólo un evento con `launch`/`immediate` se
redirige al Playground. Con otros valores, el evento pasa a evaluarse contra los triggers de negocio
**reales**, y si además el par no es uno de los tres a los que el canal está suscrito, no llega a ninguna
parte y no verás nada.

**El Playground nunca produce findings.** Usa `generateText` sin esquema de salida: devuelve texto libre. El
formato estructurado sólo aparece cuando el trigger se dispara de verdad.

## Salida y persistencia

**`hardened_yaml` se genera pero no se ve.** El esquema de salida pide al modelo un manifiesto endurecido, el
backend lo guarda en el análisis… y **ninguna pantalla lo muestra**. Se paga en tokens y no se aprovecha.
*Workaround parcial:* pide en el `system` que el YAML corregido vaya también dentro del `report`, que sí se
renderiza.

**Los análisis no se persisten.** Viven en memoria del canal, con un tope de **50**; a partir de ahí se
descarta el más antiguo. Un reinicio del backend los pierde todos. Si necesitas conservar un hallazgo,
expórtalo tú (copia el informe).

**El buffer de métricas es de 100 lecturas.** Las tools de histórico (`get_prev_*`) no pueden mirar más atrás
de eso, y arrancan vacías al abrir el canal.

## Alcance y seguridad

**No hay filtro de sólo-lectura en las tools.** El interruptor `Auto` de un trigger entrega el catálogo
**completo**, incluidas `delete_pod`, `restart_deployment`, `add_node`, `remove_node` y el escalado. Se
ejecutan con el service account del backend, no con los permisos del usuario. Ver
[Permisos y acceso](05-rbac.md).

**No hay permisos granulares.** El canal sólo admite los scopes `none` y `cluster`, y cualquiera de los dos
da acceso completo: leer y borrar los análisis de todos, y editar los providers de IA compartidos, claves
incluidas.

**Los objetos preexistentes no se analizan.** Ante un `ADDED`, si el `creationTimestamp` del objeto es
anterior al arranque del canal, se descarta. Es intencionado —evita analizar el clúster entero cada vez que
alguien abre el canal— pero significa que no puedes auditar lo que ya existe sin recrearlo o pasarlo por el
Playground.

**Los kinds vigilados están fijados en el código.** `Pod`, `Deployment`, `DaemonSet`, `StatefulSet`,
`ReplicaSet`, `Job`, `CronJob`, `ReplicationController`, `Service`, `Ingress`, `HTTPRoute`. No hay CRDs y no
es configurable desde la UI.

## Cosméticos

**`medium` se pinta en verde.** El código de colores es `critical`=rojo, `high`=naranja, `medium`=verde,
`low`=gris. Guíate por el texto de la etiqueta.

**El formateo de la descripción de un finding es mínimo.** Un fragmento entre ` **` y `** ` se pinta en
negrita y subrayado, y sólo el primero de la cadena. No es markdown. El markdown de verdad está en el
**Report**.

---

El backlog de desarrollo con el estado de estos puntos está en `plans/pinocchio/PLAN.md`.
