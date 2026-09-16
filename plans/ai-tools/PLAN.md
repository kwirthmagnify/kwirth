# Sistema de tools de IA — Plan

Las tools que el core ofrece a los modelos viven en `common-ai/src/back.ts`. Funcionan, y el sistema ha
crecido rápido: **43 tools** en un fichero de **1.308 líneas**, consumidas por seis plugins (agora, censor,
montag, pinocchio, excubitor, iter) más el propio front del core.

Este plan recoge cinco frentes detectados el **2026-09-16**. Ninguno es un bug abierto: es deuda que hoy
se nota poco y que crece con cada tool nueva.

## Estado verificado (2026-09-16)

Todo lo de abajo está comprobado sobre el código, no supuesto:

| | |
|---|---|
| Tools implementadas | **43** (`export const tools`, línea 392) |
| Entradas en `toolInfoList` | **43** (línea 1203) — hoy **sin desincronizar** |
| Por efecto | **35 READ**, **8 WRITE** |
| Tools WRITE | `add_node`, `remove_node`, `stop_node`, `start_node`, `add_replica`, `remove_replica`, `restart_deployment`, `delete_pod` |
| Uso de `EToolEffect` | **un solo sitio**: `selectAgentToolNames()`, para el flag `readOnly` del agente |
| Lo que ve el front | `{ name, description }` — el `effect` **no llega** al `ToolSelector` |
| Identidad en `IToolContext` | **ninguna**: `origin`, `nodes`, `clusterInfo`, `clusterMetrics`, `clusterEvents`, `sourceRepos`, `trace` |
| Traza | las 43 tools llaman a `ctx().trace(name, args)`; los 4 consumidores la mandan a `logTrace` como texto |

Dos matices que conviene no perder de vista:

- **El catálogo y su metadata son dos listas paralelas mantenidas a mano.** Hoy cuadran. Nada lo garantiza
  mañana: no hay tipo que las ate ni test que lo compruebe.
- **`readOnly` es del agente, no del usuario.** Un agente con `readOnly: false` puede borrar pods y escalar
  despliegues sin que nadie mire qué permisos tiene quien lo dispara.

## Streams

Cada stream es un MVP usable por sí solo y cierra con su CL9. El orden evita retrabajo: **S1 define la
forma** sobre la que se apoyan los cuatro siguientes.

### S1 · Una sola definición por tool

**Problema**: `tools` y `toolInfoList` se escriben por separado. Añadir una tool son dos ediciones en dos
sitios a 800 líneas de distancia, y olvidar la segunda deja una tool invisible para la selección — porque
`selectAgentToolNames()` parte de `toolInfoList`, no de `tools`. Una tool implementada y no listada
**nunca se le ofrece al modelo**, y no lo dice nadie.

**Qué se hace**: un helper `kwirthTool({ name, description, effect, group, inputSchema, execute })` que
devuelva el `tool()` de siempre y a la vez registre su metadata. `toolInfoList` pasa a **derivarse** del
catálogo en vez de escribirse.

- No cambia la firma de nada que consuman los plugins: `tools` y `toolInfoList` siguen exportándose igual.
- Se añade el campo `group` (familia), que S2 y S4 necesitan.
- Test: que toda tool implementada tenga metadata y viceversa — el invariante que hoy solo sostiene la
  disciplina.

**Coste**: una pasada mecánica por las 43. Sin cambio de comportamiento.

### S2 · El efecto se ve y se elige por familias

**Problema**: quien configura un agente elige tools de una lista plana de 43 nombres donde `delete_pod`
y `list_namespaces` se ven exactamente igual. Y `autoTools` significa *las 43*, lo que además de arriesgado
mete 43 esquemas en cada prompt.

**Qué se hace**:

- `ToolSelector` recibe `effect` y `group`, agrupa por familia y **marca las WRITE** de forma inequívoca.
- `autoTools` deja de ser "todas" y pasa a ser "todas las de las familias elegidas" (o todas las READ, a
  decidir en las preguntas abiertas).

**Coste**: front, un componente compartido. Depende de S1 para tener `group`.

### S3 · Permisos de verdad para las tools que escriben

**Problema**: `effect: WRITE` solo lo mira el flag `readOnly` del agente. No hay relación con el usuario:
`IToolContext` no lleva identidad ni accessKey, así que una tool no puede saber quién la invoca ni con qué
permisos.

**Qué se hace**:

- `IToolContext` gana la identidad del invocador y sus scopes.
- `runAgent()` filtra las WRITE contra esos scopes **además** del `readOnly` que ya existe. Dos puertas:
  la del agente y la de quien lo dispara.
- El core ya tiene catálogo global de scopes RBAC; se reutiliza, no se inventa uno paralelo.

**Coste**: el mayor de los cinco, porque toca la firma del contexto y a sus cuatro consumidores. Aun así
es acotado: los plugins ya construyen el contexto en un solo sitio cada uno.

⚠️ **Es el que más se parece a un agujero de seguridad**, no a deuda técnica. Si hay que priorizar uno
fuera de orden, es este.

### S4 · Coste: no mandar 43 esquemas en cada llamada

**Problema**: cada tool que entra en la llamada son tokens de entrada en **cada** paso del agente, y
`stopWhen: stepCountIs(15)` multiplica. Con `autoTools` se pagan las 43 aunque la conversación vaya de
logs.

**Qué se hace**: medir primero — cuántos tokens de entrada cuesta el catálogo completo frente a una
familia. Con el dato, decidir entre selección por familia (S2 ya la habilita), un tope por agente, o
selección por intención. **Sin la medida no se decide nada**: es justo el tipo de optimización que se hace
a ojo y no ahorra.

**Coste**: la medición es barata. Lo demás depende de lo que diga.

### S5 · Traza estructurada

**Problema**: `trace(name, args)` existe y las 43 tools lo llaman, pero los cuatro consumidores lo
convierten en una línea de log. No hay duración, ni resultado, ni error, ni forma de preguntar "qué tools
falla más" o "cuánto tarda `get_pod_logs`".

**Qué se hace**: la traza pasa a llevar duración, resultado (truncado) y error. Los consumidores actuales
siguen pudiendo escribir su línea de log; quien quiera, guarda. Cambio compatible: se añade un segundo
argumento opcional, no se rompe la firma.

**Coste**: bajo. El punto de instrumentación ya está en las 43.

### S6 · Que una extensión aporte sus tools

**Problema**: el catálogo es fijo y del core. Un plugin con conocimiento propio —el inventario de
excubitor, el mapa de iter, las sesiones de montag— no puede ofrecérselo a un modelo salvo metiéndolo en
`common-ai`, que es de todos.

**Qué se hace**: un registro donde una extensión declara sus tools, con el mismo `kwirthTool()` de S1, y
quedan disponibles para los agentes de esa extensión. Namespacing por id de extensión para que dos plugins
no colisionen.

**Coste**: el de más diseño. Va el último a propósito: la forma de la definición la fija S1 y la de los
permisos S3, y hacerlo antes obligaría a rehacerlo.

⚠️ S6 y S7 **no compiten**: S6 es el registro en memoria —el mecanismo— y S7 es el empaquetado, la
distribución y la configuración por encima. Un bundle de S7 acaba registrando sus tools en el registro de
S6. Hacer S7 sin S6 significa escribir el registro igualmente, pero enterrado en el manager.

### S7 · El bundle de tools como tipo de extensión

**Idea**: que un conjunto de tools sea un **artefacto instalable** de Kwirth, como un plugin o un sender.
El admin instala bundles desde el marketplace, decide **qué bundles puede usar cada plugin**, y afina
encendiendo y apagando tools sueltas. Toda esa decisión es una **config de tools** exportable.

**Modelo de configuración.** Tres capas que se resuelven en orden:

```
tools efectivas = (⋃ tools de los bundles activos) − (tools desactivadas dentro de esos bundles) + (tools sueltas añadidas)
```

- **Bundles activos**: qué paquetes entran en juego.
- **Desactivadas**: dentro de un bundle activo, apagar una tool concreta sin renunciar al resto. Es lo que
  permite instalar un bundle de 20 tools y dejar fuera las tres que borran cosas.
- **Sueltas añadidas**: una tool concreta de un bundle no activo. La vía de escape para no tener que
  activar un paquete entero por una sola tool.

Exportable e importable como JSON, igual que la configuración de senders, plugins y providers.

**Dos niveles de decisión, y conviene no confundirlos**:

| Quién | Qué decide | Dónde |
|---|---|---|
| **Admin** | El **techo**: qué bundles y qué tools puede usar un plugin | config de tools (S7) |
| **Agente** | Qué usa **de eso**, para su tarea concreta | `ToolSelector` (S2) y `agent.tools` |

El `ToolSelector` de S2 pasa entonces a ofrecer solo lo que el techo permite. Si el admin no lo ha
autorizado, el agente no puede pedirlo.

**Lo que cuesta, sin adornos.** Hoy hay **10 tipos de extensión**, **12 managers** en el back y **10
diálogos** de manager en el front. Un tipo nuevo arrastra toda esa cola: entrada en `EExtensionType`,
manager con su índice en ConfigMap, instalación/desinstalación/rehidratación, carga de `kwirth-dev.json`,
soporte bundled, entrada de manifest, diálogo de manager con sus cuatro vistas (instalados/disponibles ×
card/lista), documentación y guía. Es **el stream más caro del plan con diferencia**, y es el único cuyo
coste no está en la lógica sino en la superficie que toca.

⚠️ **Y hay un problema de confianza que no existe en los otros streams**: un bundle es **código que corre
en el core con acceso al cluster**. Instalar un bundle de un tercero es darle a ese tercero lo que S3
intenta acotar. S7 **no debería cerrarse sin S3 hecho**, y probablemente necesite además una decisión
explícita sobre de qué marketplaces se aceptan bundles.

**Coste**: alto y en superficie, no en algoritmo. Depende de S1 (forma de la definición), S3 (permisos) y
S6 (registro).

### S8 · Diálogo común de toolset

**Idea**: un diálogo de configuración de toolset **compartido por todos los plugins que usan IA**, igual
que hoy lo son `AiConfigProvider` y `AiConfigLlm`. Tercer hermano en `common-ai/src/front.tsx`, servido
por el global del core, consumido por los seis plugins sin que ninguno lo reimplemente.

Es la cara visible de S7: sin él, la config de tools se queda en un JSON que nadie edita.

**Reparto de responsabilidades: el core pone el editor, el plugin guarda.** No es una decisión nueva, es
**la convención que ya siguen los otros dos** — `common-ai/src/front.tsx` no tiene **ni un `fetch`**. Los
dos diálogos existentes son componentes controlados: reciben el valor por props y lo devuelven en
`onClose(valor | undefined)`; pinocchio, por ejemplo, persiste los LLMs por su propio canal. S8 se limita
a hacer lo mismo:

```ts
interface IAiConfigToolsetProps {
    catalog: IToolBundle[]          // lo disponible, del core
    config: IToolsetConfig          // el techo actual del plugin, que el plugin le pasa
    readOnly?: boolean
    onClose: (config: IToolsetConfig | undefined) => void
}
```

Consecuencias, todas buenas:

- **No hace falta clave de storage nueva en el core** ni endpoint por plugin. El techo vive en la
  configuración del plugin, donde ya viven sus demás ajustes.
- **El export/import sale casi gratis**: cada plugin ya exporta e importa su configuración en JSON, y el
  techo pasa a ser un campo más de ella.
- **El diálogo no necesita saber de qué plugin es.** Lo sabe el plugin, que es quien lo abre y quien
  guarda.

Y una consecuencia que conviene mirar de frente:

⚠️ **Si guarda el plugin, el techo vale lo que valga la puerta de su configuración.** El "solo el admin
puede levantar el techo" deja de ser una decisión centralizada y pasa a depender de cómo esté protegida la
config de cada plugin. Hay que comprobar plugin a plugin, no darlo por hecho.

📌 **Aparte, y sin relación con las tools**: hoy `/core/aiconfig` se protege solo con `validKey`, sin scope
de admin, así que cualquier usuario con una key válida puede leer y escribir los providers de IA — **que
llevan las API keys dentro**. Con el reparto de arriba esto ya no bloquea S8, pero queda anotado porque es
un frente propio.

**Forma del diálogo**: la misma pieza con dos lecturas.

- **Editable**: bundles activos, tools desactivadas dentro de ellos y tools sueltas añadidas — las tres
  capas de S7.
- **Solo lectura** (`readOnly`): ver qué tiene disponible el plugin y por qué. Que un usuario pueda *ver*
  el techo sin poder moverlo es lo que evita el "no sé por qué el agente no encuentra los logs".

**Coste**: bajo. Es un selector agrupado con tres estados y sin persistencia propia. Depende de S7 para
tener bundles que enseñar.

## Decidido (2026-09-16)

- **El techo es POR PLUGIN.** A nivel global solo existe el catálogo de *tools disponibles*; la
  autorización se declara plugin a plugin.
- **Un plugin sin config no tiene tools.** Denegar por defecto, no heredar.
- **Las 43 de hoy se reparten en bundles temáticos.** No se quedan como catálogo empotrado: el core deja
  de traerlas por dentro y pasan a ser bundles, *built-in* pero bundles.
- **Los bundles son temáticos**, por dominio: kubernetes, repositorios fuente, etc.

### Reparto propuesto de las 43

A validar, pero sale casi solo de los nombres y de lo que hace cada una:

| Bundle | N | Tools |
|---|---|---|
| `k8s-inventory` | 8 | `list_namespaces`, `get_cluster_data`, `get_node_data`, `get_workload_data`, `get_space_data`, `list_services`, `list_ingresses`, `get_workload_config_refs` |
| `k8s-describe` | 11 | `describe_pod`, `describe_service`, `describe_ingress`, `describe_controller`, `get_pod_yaml`, `get_deployment_yaml`, `get_controller_yaml`, `get_service_yaml`, `get_ingress_yaml`, `get_namespace_yaml`, `get_rollout_history` |
| `k8s-metrics` | 7 | `get_cluster_usage`, `get_node_usage`, `get_deployment_usage`, `get_prev_cluster_usage`, `get_prev_node_usage`, `get_prev_deployment_usage`, `get_prev_space_data` |
| `k8s-observability` | 3 | `get_cluster_events`, `get_object_events`, `get_pod_logs` |
| `k8s-secrets` | 3 | `get_configmap`, `get_secret`, `get_certificate_info` |
| `k8s-ops` | 8 | **las 8 WRITE**: `add_node`, `remove_node`, `stop_node`, `start_node`, `add_replica`, `remove_replica`, `restart_deployment`, `delete_pod` |
| `source-repos` | 1 | `get_source_file` |
| `examples` | 2 | `times_two`, `father_of` |

Suman 43. Tres observaciones del reparto:

- **`k8s-ops` es exactamente el conjunto WRITE.** Que la frontera temática coincida con la de efecto no es
  casualidad y viene bien: negar ese bundle a un plugin es negar toda la escritura, sin depender de que
  nadie marque bien un flag.
- **`k8s-secrets` merece existir aunque todas sus tools sean READ.** `get_secret` lee Secrets de
  Kubernetes: es la tool más sensible del catálogo y `EToolEffect` no lo expresa, porque READ/WRITE habla
  de *efecto*, no de *sensibilidad*. Separarla en su bundle permite denegarla sin renunciar al resto de
  lecturas. Merece pensarse si `IToolInfo` necesita una tercera dimensión.
- **`examples` no debería estar en producción.** `times_two` devuelve `data * 2` y `father_of` devuelve la
  cadena `'Julio'` para cualquier entrada. Hoy, con `autoTools`, **se le ofrecen al modelo como las
  demás**: gastan tokens y pueden despistarlo. Aislarlas en un bundle que nadie activa es lo mínimo;
  borrarlas es lo honesto.

## Preguntas abiertas

Hay que responderlas antes de empezar el stream que las toca, no antes de empezar el plan:

1. **`autoTools`** (S2): ¿pasa a ser "todas las READ" o "todas las de las familias elegidas"? La primera
   es más segura, la segunda más útil. Afecta a agentes ya configurados.
2. **Scope para WRITE** (S3): ¿basta un scope de cluster que ya exista, o hace falta uno propio de IA?
   ¿Y se pide confirmación humana para las destructivas, o solo permiso?
3. **Familias** (S1/S2): propuesta inicial a partir de los nombres — `inventory`, `describe`, `usage`,
   `events`, `logs`, `scale`, `nodes`, `config`, `source`. Hay que validarla contra las 43.
4. **Dónde se guarda la traza** (S5): ¿solo log, o persistencia? Si persiste, en el store del core o en
   SQL vía `common-sql`.
5. **Procedencia de los bundles** (S7): ¿de cualquier marketplace, o solo de los de confianza? Un bundle
   ejecuta código en el core.
6. 🔴 **La transición** (S7): "un plugin sin config no tiene tools" es la decisión correcta y además es
   **rompedora**. Hoy seis plugins tiran de `autoTools`, que significa las 43; el día que entre S7, un
   Kwirth ya desplegado se queda con **cero tools** hasta que un admin configure el techo de cada plugin.
   No se rompe ruidosamente: los agentes siguen respondiendo, solo que peor y sin decir por qué, que es la
   peor forma de romperse. Hay que decidir entre tres salidas, y ninguna es gratis:
   - config inicial derivada de lo que cada plugin usaba (deja de ser "denegar por defecto" el primer día),
   - denegar y **avisar en la UI** de forma visible cuando un plugin no tiene techo configurado,
   - denegar en silencio y documentarlo como paso obligatorio de la actualización.

   ⚠️ En dev da igual —el estado se borra—, pero hay Kwirth en producción de clientes con agora y
   pinocchio funcionando.

## Lo que este plan NO hace

- No toca el motor: `buildModel`, `generateText` y el `AsyncLocalStorage` del contexto se quedan como están.
- No cambia la persistencia de providers ni de modelos, que es única y funciona.
- No añade tools nuevas. Si hacen falta, entran por el flujo de siempre; este plan va de cómo se definen,
  se eligen, se autorizan y se observan.
