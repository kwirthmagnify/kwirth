# Sistema de tools de IA — Plan

Las tools que el core ofrece a los modelos viven hoy en `common-ai/src/back.ts`: **43 tools** en un fichero
de **1.308 líneas**, consumidas por seis plugins (agora, censor, montag, pinocchio, excubitor, iter) más el
front del core.

Este plan **no es un refactor de eso**. Define a dónde queremos llegar —un runtime de tools con los
toolsets como unidad— y luego trata lo que hoy existe como su primer cliente, no como el punto de partida.

## Estado verificado (2026-09-16)

Comprobado sobre el código, no supuesto. Sirve para saber qué hay que mover, no para decidir la forma:

| | |
|---|---|
| Tools implementadas | **43** (`export const tools`, línea 392) |
| Entradas en `toolInfoList` | **43** (línea 1203) — hoy sin desincronizar |
| Por efecto | **35 READ**, **8 WRITE** |
| Tools WRITE | `add_node`, `remove_node`, `stop_node`, `start_node`, `add_replica`, `remove_replica`, `restart_deployment`, `delete_pod` |
| Uso de `EToolEffect` | **un solo sitio**: `selectAgentToolNames()`, para el flag `readOnly` del agente |
| Lo que ve el front | `{ name, description }` — el `effect` **no llega** al `ToolSelector` |
| Campos de `IToolContext` | `origin`, `nodes`, `clusterInfo`, `clusterMetrics`, `clusterEvents`, `sourceRepos`, `trace` |
| Traza | las 43 llaman a `ctx().trace(name, args)`; los 4 consumidores la convierten en una línea de log |

Cinco cosas que el diseño de destino tiene que resolver, y que salen de esa tabla:

1. **Dos listas paralelas a mano.** Y la asimetría muerde: `selectAgentToolNames()` parte de
   `toolInfoList`, así que una tool implementada y no listada **no se le ofrece jamás al modelo**, sin
   error ni aviso.
2. **`readOnly` es del agente, no del usuario.** Nadie mira qué permisos tiene quien dispara el agente.
3. **El contexto es un cajón de sastre.** Siete campos que recibe todo el mundo por si acaso;
   `sourceRepos` existe para **una sola** de las 43.
4. **`effect` no distingue exponer de modificar.** `get_secret` lee Secrets de Kubernetes: es READ y es lo
   más peligroso del catálogo.
5. **Observar es cosa de cada consumidor.** Cuatro lambdas `trace` que hacen los cuatro lo mismo.

## El destino

### La unidad es el toolset

No hay "catálogo global de tools". Hay **toolsets instalados**, cada uno expone las suyas, y el core trae
unos cuantos de fábrica. `common-ai` deja de ser donde viven las tools y pasa a ser donde vive el **runtime**
de tools.

**Ninguna tool es alcanzable fuera de un toolset.** Si hace falta gestionar una tool sola, se empaqueta un
toolset con una sola tool — decidido el 2026-09-17. No existe el concepto de "tool suelta" ni en el modelo,
ni en la configuración, ni en la UI.

### Una tool se declara con todo lo necesario para decidir sobre ella

No solo para ejecutarla:

```ts
interface IAiTool {
    name: string
    description: string
    inputSchema: ZodSchema
    effect: EToolEffect            // READ | WRITE — qué le hace al mundo
    sensitivity: EToolSensitivity  // qué expone — resuelve el caso get_secret
    requires?: string[]            // permiso que exige para invocarse
    execute: (args, ctx) => Promise<unknown>
}
```

### Un toolset declara qué necesita, y el host le da eso y nada más

```ts
interface IAiToolset {
    id: string                     // 'k8s-inventory'
    version: string
    tools: IAiTool[]
    requires: ECapability[]        // ['k8s'] | ['k8s','metrics'] | ['repos']
}
```

Esto sustituye al cajón de sastre: cada toolset recibe las capacidades que pidió, no las siete por si acaso.

### La autorización se evalúa al invocar, no al seleccionar

Hoy las WRITE se filtran de la lista **antes** de la llamada. Eso no puede expresar *"puedes borrar un pod
en `dev` pero no en `prod`"*, porque al filtrar todavía no existen los argumentos. Comprobando al invocar,
sí. El filtro por selección se queda como está —es útil, y ahorra tokens— pero deja de ser la única puerta.

### Observar es del runtime

Si invocar pasa por un solo sitio, ese sitio mide el tiempo, captura el error y emite el registro. Los
consumidores dejan de pasar lambdas y reciben algo estructurado. Gratis para los cuatro de hoy y para los
que vengan.

### Lo que ve el modelo se deriva de una cadena

```
toolsets instalados → techo del plugin → selección del agente → permisos de quien dispara
```

Y el techo del plugin, en dos capas:

```
tools del techo = (⋃ toolsets activos) − (tools desactivadas dentro de ellos)
```

| Quién | Qué decide |
|---|---|
| **Admin** | El techo: qué toolsets puede usar un plugin, y qué tools apaga dentro de ellos |
| **Agente** | Qué usa de ese techo para su tarea |
| **Runtime** | Si quien dispara tiene permiso, en el momento de invocar |

## Qué le pasa a lo de hoy

Deja de ser el punto de partida y pasa a ser el primer cliente del runtime:

- Las **43 tools** se reparten en los ocho toolsets *built-in* y se reescriben con la declaración nueva.
- **`toolInfoList` desaparece**: no se deriva, no hace falta.
- **`selectAgentToolNames()` desaparece**: lo sustituye la cadena de resolución.
- **Los cuatro lambdas `trace` desaparecen.**
- **`IToolContext` se parte** por capacidades.

## Streams

Cada stream es un MVP usable y cierra con su CL9.

**El orden nace de una decisión (2026-09-17): primero el tipo de extensión, luego el core, luego el primer
cliente.** La alternativa era empezar migrando las 43 y empaquetar al final, y tenía un defecto de fondo:
obligaba a *adivinar* en el contrato tres cosas que solo sabe quien empaqueta y carga —cómo se registra un
toolset cargado en caliente, cómo se referencia una tool sin ambigüedad y cómo se evitan colisiones de id—.
Adivinarlas mal no se paga con un refactor: se paga migrando configuraciones ya guardadas en Kwirth de
clientes. Construyendo el tipo primero, esas tres decisiones las toma quien las necesita.

### S1 · El tipo `aitoolset`, de punta a punta — ✅ CERRADO (CL9 2026-09-16)

Contrato (`IAiTool`, `IAiToolset`, `ECapability`, `EToolSensitivity`), carga, registro, manager con su
índice, entrada de manifest, soporte en `kwirth-dev.json` y bundled, y el diálogo del manager. Sería el
**undécimo** tipo de extensión: hoy hay **10 tipos**, **12 managers** en el back y **10 diálogos** en el
front, y un tipo nuevo arrastra toda esa cola.

**Validado con dos toolsets reales, y hacen falta los dos**:

- **`examples`** (`times_two`, `father_of`): recorre el camino entero —empaquetar, publicar, instalar,
  registrar, invocar— con riesgo cero. Prueba la **mecánica**.
- **`k8s-inventory`** (8 tools): prueba el **contrato**. Dos tools que reciben un número y devuelven otro no
  dicen nada sobre si `ECapability` o `sensitivity` están bien planteados; ocho que necesitan contexto de
  cluster, sí. Sin este segundo, el contrato se congela sin haberse ejercitado.

Aquí se cierran las tres decisiones que lo condicionan todo hacia adelante:

1. **La puerta del registro**, que es la de runtime — built-in e instalado se registran por la misma API.
2. **La referencia cualificada a una tool** (`toolset/tool`). Hoy `IAgent.tools` es `string[]` plano y eso
   **se persiste en la config de cada agente**; con toolsets de terceros, dos pueden traer `get_pod_logs`.
3. **El espacio de nombres de los id de toolset**, para que un tercero no pueda chocar con un built-in.

⚠️ Mientras S1 y S2 están en vuelo, **las 43 de hoy siguen funcionando por el camino viejo**. No hay
big-bang: el camino antiguo muere en S3, cuando ya hay dónde aterrizar.

🛑 **PARADA OBLIGATORIA antes de crear `AiToolsetManagerDialog`** (orden del usuario, 2026-09-17). Un
diálogo de manager no se escribe a ojo: hay once managers y el criterio de UI —instalados/disponibles ×
card/lista— vive en `plans/extension-managers-ui/PLAN.md`. Se para, se audita y se acuerda antes de
escribir el componente.

#### Cómo cerró S1 (2026-09-16)

La parada se resolvió **no escribiendo** un `AiToolsetManagerDialog`: el usuario decidió construir un
gestor **genérico dirigido por descriptor** (`ExtensionManagerDialog` + `extensionManagerModel` +
`ExtensionCard`) que acabará sustituyendo a los diez a medida, y estrenarlo con `aitoolset` —el único tipo
sin diálogo propio, así que estrenarlo no podía romper nada—. Detalle en
`plans/extension-managers-ui/PLAN.md`.

Entregado: contrato en `common-ai` (`EToolEffect`, `EToolSensitivity`, `ECapability`, `toolRef`/`parseToolRef`,
`IAiToolInfo`/`IAiToolsetInfo`/`IToolsetConfig`), registro único con ids reservados en `common-ai/back`,
`AiToolsetManager` (tgz · fichero · **carpeta** para dev · bundled · poda de dev huérfanos), `AiToolsetApi`
(`/` instalado, `/catalog` registrado), cableado en `PackApi`/`ExtensionDeps`/`MarketplaceManager`, descriptor
del tipo en el front, `aitoolsets/manifest.json` y el primer artefacto: **`playground` 0.1.0** publicado en npm
público (`@kwirthmagnify/kwirth-aitoolset-playground`).

⚠️ **El toolset de validación se llama `playground`, no `examples`**: se renombró al crearlo, y trae **sus
propias** copias de `times_two` y `father_of` — las dos de juguete que hay en `common-ai` **no se tocaron**.

⚠️ **Queda pendiente `k8s-inventory`**, el segundo toolset de validación, y con él lo que de verdad ejercita
el contrato: `playground` valida la **mecánica** (empaquetar → publicar → instalar → registrar → invocar), no
si `ECapability` y `sensitivity` están bien planteados. **El contrato sigue sin congelar hasta entonces.**

### S2 · El core consume toolsets

La cadena de resolución, el contexto por capacidades y **un único camino de invocación** con sus dos
ganchos —autorizar y observar—, de momento permisivos. Se valida contra los toolsets de S1.

Aquí muere el cajón de sastre: cada toolset recibe las capacidades que declaró, no los siete campos por si
acaso.

### S3 · Primer cliente: las 43

Las 43 tools se reparten en los ocho toolsets built-in y se registran por la misma puerta. Mueren
`toolInfoList`, `selectAgentToolNames()` y los cuatro lambdas `trace`. Al acabar, Kwirth se comporta igual
que hoy y ya no queda camino viejo.

**Riesgo**: el de toda migración masiva — una errata en un `name` rompe una tool en silencio. Lo cubren el
test del invariante y `tsc`.

### S4 · Autorización de verdad

El gancho de S2 deja de ser permisivo: identidad y scopes de quien dispara, comprobados **al invocar**, con
los argumentos delante — que es lo único que permite expresar "puedes borrar un pod en `dev` pero no en
`prod`". `sensitivity` entra en juego aquí, no solo `effect`.

⚠️ Es el que más se parece a un agujero de seguridad, no a deuda técnica. Y **S1 no debería publicarse a un
marketplace abierto sin esto**: un `aitoolset` es código que corre en el core con acceso al cluster.

### S5 · Techo por plugin y selector por toolset

El `ToolSelector` agrupado por toolset marcando WRITE y sensibles, y el **diálogo común** de configuración:
tercer hermano de `AiConfigProvider` y `AiConfigLlm` en `common-ai/src/front.tsx`.

**El core pone el editor, el plugin guarda** — es la convención que ya siguen los otros dos:
`common-ai/src/front.tsx` no tiene **ni un `fetch`**, son componentes controlados que devuelven el valor en
`onClose`. De ahí que no haga falta clave de storage nueva, ni endpoint por plugin, y que el export/import
salga de la configuración del propio plugin.

```ts
interface IAiConfigToolsetProps {
    catalog: IAiToolset[]
    config: IToolsetConfig
    readOnly?: boolean
    onClose: (config: IToolsetConfig | undefined) => void
}
```

⚠️ **Si guarda el plugin, el techo vale lo que valga la puerta de su configuración.** Hay que comprobarlo
plugin a plugin, no darlo por hecho.

### S6 · Observación

El camino único de invocación emite registros con duración, resultado y error. Los consumidores dejan de
pasar lambdas.

### S7 · Coste en tokens

Medir cuánto cuesta el catálogo completo frente a un toolset — cada tool entra en **cada** paso del agente,
y `stopWhen: stepCountIs(15)` multiplica. Con el dato, decidir. **Sin la medida no se decide nada.**

## Decidido

- **El techo es POR PLUGIN.** A nivel global solo existe qué toolsets hay instalados.
- **Un plugin sin config no tiene tools.** Denegar por defecto, no heredar.
- **Las 43 se reparten en `aitoolset` temáticos**, *built-in* pero toolsets.
- **El tipo de extensión se llama `aitoolset`** (2026-09-17), minúscula y una palabra, como el resto de
  `EExtensionType`.
- **No hay tools sueltas** (2026-09-17): para gestionar una tool sola, un toolset de una tool.
- **La agrupación del selector ES el toolset** (2026-09-17). No hay taxonomía de familias aparte: tener las
  dos serían dos taxonomías paralelas sobre las mismas tools.

### Reparto propuesto de las 43

| `aitoolset` | N | Tools |
|---|---|---|
| `k8s-inventory` | 8 | `list_namespaces`, `get_cluster_data`, `get_node_data`, `get_workload_data`, `get_space_data`, `list_services`, `list_ingresses`, `get_workload_config_refs` |
| `k8s-describe` | 11 | `describe_pod`, `describe_service`, `describe_ingress`, `describe_controller`, `get_pod_yaml`, `get_deployment_yaml`, `get_controller_yaml`, `get_service_yaml`, `get_ingress_yaml`, `get_namespace_yaml`, `get_rollout_history` |
| `k8s-metrics` | 7 | `get_cluster_usage`, `get_node_usage`, `get_deployment_usage`, `get_prev_cluster_usage`, `get_prev_node_usage`, `get_prev_deployment_usage`, `get_prev_space_data` |
| `k8s-observability` | 3 | `get_cluster_events`, `get_object_events`, `get_pod_logs` |
| `k8s-secrets` | 3 | `get_configmap`, `get_secret`, `get_certificate_info` |
| `k8s-ops` | 8 | **las 8 WRITE** |
| `source-repos` | 1 | `get_source_file` |
| `examples` | 2 | `times_two`, `father_of` |

Suman 43. Tres observaciones:

- **`k8s-ops` es exactamente el conjunto WRITE.** Negar ese toolset a un plugin es negar toda la escritura,
  sin depender de que nadie marque bien un flag.
- **`k8s-secrets` merece existir aunque sus tres tools sean READ.** Es el caso que justifica
  `sensitivity`: `get_secret` no modifica nada y expone todo.
- **`examples` no debería estar en producción.** `times_two` devuelve `data * 2` y `father_of` devuelve la
  cadena `'Julio'` para cualquier entrada. Hoy, con `autoTools`, se le ofrecen al modelo como las demás.
  Aislarlas en un toolset que nadie activa es lo mínimo; borrarlas es lo honesto.

## Preguntas abiertas

1. **`autoTools`** (S4): ¿"todas las READ" o "todas las de los toolsets activos"? Afecta a agentes ya
   configurados.
2. **Permisos** (S3): ¿basta un scope de cluster que ya exista, o hace falta uno propio de IA? ¿Y las
   destructivas piden confirmación humana, o solo permiso?
3. **Capacidades** (S2): el catálogo inicial de `ECapability` — `k8s`, `metrics`, `events`, `repos` sale del
   contexto de hoy, pero hay que validarlo contra las 43.
4. **Dónde se guarda la observación** (S5): ¿solo log, o persistencia? Si persiste, store del core o SQL
   vía `common-sql`.
5. **Procedencia de los toolsets** (S6): ¿de cualquier marketplace, o solo de los de confianza?
6. 🔴 **La transición** (S4): "un plugin sin config no tiene tools" es correcto y **rompedor**. Hoy seis
   plugins tiran de `autoTools` = las 43; el día que entre el techo, un Kwirth desplegado se queda con
   **cero tools** hasta que un admin lo configure. Y no se rompe ruidosamente: los agentes siguen
   respondiendo, solo que peor y sin decir por qué. Tres salidas, ninguna gratis:
   - config inicial derivada de lo que cada plugin usaba (deja de ser "denegar por defecto" el primer día),
   - denegar y **avisar en la UI** cuando un plugin no tiene techo,
   - denegar en silencio y documentarlo como paso obligatorio de la actualización.

   ⚠️ En dev da igual —el estado se borra—, pero hay Kwirth en producción de clientes con agora y pinocchio.

## Lo que este plan NO hace

- No toca el motor: `buildModel`, `generateText` y el `AsyncLocalStorage` se quedan.
- No cambia la persistencia de providers ni de modelos, que es única y funciona.
- No añade tools nuevas. Va de cómo se declaran, se empaquetan, se eligen, se autorizan y se observan.

## Anotado aparte

📌 Hoy `/core/aiconfig` se protege solo con `validKey`, **sin scope de admin**: cualquier usuario con una
key válida puede leer y escribir los providers de IA, **que llevan las API keys dentro**. No bloquea este
plan —el techo lo guarda el plugin— pero es un frente propio.

📌 La **vista de lista** del gestor generico se ha validado con **un solo** `aitoolset` publicado
(`playground`, QA del 2026-09-16). La alineacion de columnas solo se ve de verdad con varias filas de
anchos distintos, asi que **hay que volver a revisarla** cuando haya mas toolsets en el catalogo.
