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

#### El contrato de capabilities (2026-09-16, segundo cierre de S1)

`k8s-inventory` 0.1.0 —8 tools de inventario, publicado— hizo su trabajo: destapó que **un `aitoolset`
empaquetado no tenía forma de llegar al cluster**. Las 43 de hoy leen un `AsyncLocalStorage` privado de
`common-ai` cuyo accesor **no se exporta**, y exportarlo habría repartido el saco entero (`saToken`, `token`,
`senders`, `webhooks`, `dockerApi`, ~20 clientes de API) a cualquier paquete de terceros. `playground` no
podía verlo: no necesita nada.

Decisión, que es la que ya pedía este plan —*el toolset declara qué necesita y el host le da eso y nada más*—:

- `execute(args)` pasa a **`execute(args, host)`**. Añadir un parámetro es compatible: una tool que solo usa
  `args` sigue valiendo.
- **`buildToolHost(requires, context)`** construye el host en UN solo sitio. Que el reparto viva ahí es lo que
  hace cumplible la promesa: si cada sitio armara su objeto, bastaría con que uno fuera generoso para que
  `ECapability` dejara de significar nada.
- **`IK8sCapability` es una fachada**, no `ClusterInfo`: presta identidad del cluster, mapa de nodos y tres
  clientes (`coreApi`, `appsApi`, `networkApi`). Ampliarla es una decisión consciente.
- **`trace` no es capability**: va siempre, es el sobre de la invocación.
- Los tipos de `@kubernetes/client-node` entran **solo como tipos** (peer opcional): nadie arrastra el SDK.

**Resultado de la validación: la fachada fue SUFICIENTE.** Ninguna de las 8 necesitó nada fuera de su
`requires`, y las 8 respondieron contra el cluster de dev (`verify.mjs`: 18 namespaces, 34 services, 5
ingresses). Con eso, el contrato **queda ejercitado** y S1 cerrado.

⚠️ **Sin endpoint de invocación en el core, a propósito.** Se valoró un `POST /core/aitoolsets/:id/tools/:name`
con un botón *Try* en el gestor. Se descartó: el LLM nunca lo usaría —S2 invoca en proceso— y **autorizar al
invocar es S4**; abrirlo antes con solo `validKey` dejaría ejecutar tools `write` sin techo. La llamada real
se prueba con `verify.mjs`, que no deja superficie nueva. Se reconsidera en S4.

### S2 · El core consume toolsets — ✅ CERRADO (CL9 2026-09-17)

La cadena de resolución, el contexto por capacidades y **un único camino de invocación** con sus dos
ganchos —autorizar y observar—, de momento permisivos. Se valida contra los toolsets de S1.

Aquí muere el cajón de sastre: cada toolset recibe las capacidades que declaró, no los siete campos por si
acaso.

**Entregado** (`common-ai@0.5.55`):

| Pieza | Qué hace |
|---|---|
| `buildToolHost(requires, context)` | El reparto por capability. *(Se adelantó en el 2.º CL9 de S1, al construir `k8s-inventory`)* |
| `resolveTools(config)` | **Pura**: de la lista ordenada a `{ effective, shadowed, missing }`. Pura a propósito, para que el **editor pinte exactamente lo que se va a ejecutar** en vez de reimplementar la regla |
| `buildAgentTools(config, context, hooks)` | Las tools listas para el SDK de IA, con nombre corto, con los dos ganchos puestos |
| `invokeToolRef(ref, args, context)` | Invocación suelta por referencia cualificada |

Decisiones que quedaron fijadas aquí:

- **Precedencia** en lugar de renombrado (ver *Precedencia entre toolsets*, arriba).
- **Un error de tool viaja como DATO, no como excepción.** Una excepción corta la conversación; un
  `{ error }` deja al modelo enterarse de que esa vía está cerrada y probar otra. Lo mismo con una
  denegación, que además se distingue en la observación (`denied: true`) de un fallo de verdad.
- **`buildAgentTools` envuelve la ejecución en `runWithToolContext`.** Cuesta una línea y es lo que permite
  migrar los ocho paquetes de S3 **de uno en uno**: una tool escrita contra el contrato viejo (las que leen
  `ctx()`) funciona por el camino nuevo sin tocarla. Hay un test que lo fija con una de las 43 de verdad.
- **Un toolset asignado que no está instalado se reporta** (`missing`), no se ignora.

⚠️ **Lo que S2 NO hace**: no toca ningún plugin. Quien rellena hoy la lista ordenada es `autoTools`; que un
admin elija cuáles y en qué orden es **S5**, y el editor donde se ve el tapado es **S5**.

### S3 · Las 43, empaquetadas en ocho `aitoolset` — ✅ CERRADO (CL9 2026-09-17)

Los ocho toolsets se publican como **paquetes**, cada uno con su versión, su harness y su CL9. Al acabar,
Kwirth se comporta igual que hoy y mueren `toolInfoList`, `selectAgentToolNames()` y los cuatro lambdas
`trace`.

**Hecho, los ocho.** Seis públicos en npm y **dos privados** en el Nexus (`@iriaoperae`), por decisión del
usuario: `k8s-ops` porque son las ocho de escritura, y `source-repos` porque lee código fuente.

| Toolset | Tools | Registro |
|---|---|---|
| `k8s-inventory` 0.2.0 | 7 | npm público |
| `k8s-describe` 0.2.0 | 12 | npm público |
| `k8s-observability` 0.1.0 | 3 | npm público |
| `k8s-metrics` 0.1.0 | 7 | npm público |
| `k8s-secrets` 0.1.0 | 3 | npm público |
| `k8s-ops` 0.1.0 | 8 | 🔒 Nexus `@iriaoperae` |
| `source-repos` 0.1.0 | 1 | 🔒 Nexus `@iriaoperae` |
| `playground` 0.1.0 | 2 | npm público |

**Pinocchio es el primer cliente**: mueren en su back `toolInfoList`, el catálogo `tools` y los cuatro
lambdas de traza; en su sitio, `buildAgentTools` + el gancho `observe`. Declara en `requiresExtension` los
cinco toolsets de lectura — ni `k8s-ops` ni `source-repos`, que se instalan y activan a mano.

#### Lo que corrigió el QA (2026-09-17)

1. **`get_space_data` estaba en el paquete equivocado** (lo cazó el usuario). Describe UN namespace, así que
   es de `k8s-describe`. La pista estaba a la vista: su pareja `get_namespace_yaml` ya vivía allí.
2. **`get_secret` NO devuelve los valores**, solo las claves — es deliberado y viene de las 43 originales.
   El que devuelve datos en crudo es `get_configmap`, y un ConfigMap es donde acaban las contraseñas de
   quien no quiso usar un Secret. La sensibilidad va al revés de lo que decía este plan: `get_configmap` es
   `SECRET`, `get_secret` es `INTERNAL`.
3. 🔴 **`dynamicTool` cambiaba el comportamiento.** En el SDK, `tool(t) => t` (solo tipos) pero
   `dynamicTool(t) => {...t, type:'dynamic'}` (marca en runtime). Lo use en S2 para esquivar una fricción de
   tipos, y con `Output.object` la invocación acababa en `AI_NoOutputGeneratedError`: la tool se ejecuta,
   devuelve, y la respuesta estructurada no llega. Ahora se construye un objeto plano, con un test que lo fija.
4. 🔴 **Tools + salida estructurada no funcionan juntas en Google.** El proveedor manda `responseSchema`
   junto a las `functionDeclarations` y Gemini se queda sin generar respuesta. **No es de S3** —el camino
   viejo hacía lo mismo— pero nunca se había dado, porque esa versión no tenía tools activas. Se arregla en
   pinocchio con el patrón que ya usaba su Playground: **fase 1 con tools y texto libre, fase 2 sin tools con
   el esquema**. ⚠️ Cuando se cablee el segundo plugin, ese patrón debe subir a `common-ai` en vez de
   copiarse.

**Riesgo**: el de toda migración masiva — una errata en un `name` rompe una tool en silencio. Lo cubren el
harness de cada paquete (el de `k8s-inventory` fija nombres, efecto y sensibilidad) y `tsc`.

⚠️ **Y uno nuevo que trae el empaquetado**: si los toolsets no viajan en la imagen, un Kwirth sin red se
queda sin tools. Por eso la decisión de 2026-09-17 incluye **bundled** para los que deban estar siempre, y
`requiresExtension` para el resto.

#### Cuándo se borran las 43 de `common-ai` (2026-09-17)

**No se borran al empaquetarlas.** El camino viejo se mantiene hasta que los plugins estén cableados al
nuevo; borrar antes dejaría a pinocchio, censor y compañía sin tools en cuanto se publique el primer
paquete.

🔴 **Mientras tanto, las 43 quedan CONGELADAS.** Una tool migrada existe dos veces —en `common-ai` y en su
paquete— y esa ventana solo es segura si nadie toca la copia vieja:

- Un arreglo o una mejora va **solo al paquete**.
- Si se parchean las dos, divergen y nadie sabrá cuál es la buena.
- Si se parchea solo la vieja, el arreglo se tira a la basura el día que se borre.

La única excepción es un fallo grave en producción que no pueda esperar al cableado; y entonces se arregla
en las dos, **a sabiendas y anotado aquí**.

Orden de borrado, cuando toque: primero el cableado de cada plugin, después `tools`, `toolInfoList`,
`selectAgentToolNames()` y los cuatro lambdas `trace`.

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

📌 **Medido en el QA de S3 (2026-09-17), con datos reales de un cluster en uso:**

- **Arrancar UN pod dispara ~10 análisis completos.** Cada evento de k8s (`ADDED` + varios `MODIFIED` +
  `DELETED`) dispara el trigger, y además **por cada versión habilitada**. Medido: ~7.000 tokens de entrada
  y ~2.500 de salida por análisis → unos **95.000 tokens por arranque de pod**.
- **`Auto` manda las 32 definiciones de tools en cada análisis**, y en el caso medido el modelo **no llamó a
  ninguna**: el prompt del trigger ya lleva el manifest dentro, así que no necesita preguntar nada.
- **Con tools activas se pagan DOS llamadas** (fases 1 y 2), no una.

Es decir: `Auto` en un trigger que se dispara con cada evento es caro y, según el prompt, puede no aportar
nada. Donde `Auto` gana es cuando el prompt NO trae los datos y el modelo tiene que ir a buscarlos. Esto es
munición directa para este stream: el techo por plugin (S5) es lo que permite acotarlo.

Medir cuánto cuesta el catálogo completo frente a un toolset — cada tool entra en **cada** paso del agente,
y `stopWhen: stepCountIs(15)` multiplica. Con el dato, decidir. **Sin la medida no se decide nada.**

## Decidido

- **El techo es POR PLUGIN.** A nivel global solo existe qué toolsets hay instalados.
- **Un plugin sin config no tiene tools.** Denegar por defecto, no heredar.
- **Las 43 se reparten en `aitoolset` temáticos.** ⚠️ **Rectificado el 2026-09-17**: no son *built-in*, son
  **paquetes independientes como cualquier otra extensión**. Algunos viajarán **bundled** en la imagen (para
  que un Kwirth recién instalado los tenga sin red) y otros se declararán como **dependencia** del plugin que
  los necesite (`requiresExtension` en su `package.json`). Decisión del usuario.

  Consecuencias, que no son menores:
  - **No hay ids reservados para estos ocho.** La maquinaria de built-in sigue existiendo, pero estos no la
    usan: `k8s-inventory` ya publicado **no choca con nada** y se queda tal cual.
  - **Cada uno hay que escribirlo contra el contrato nuevo** (`execute(args, host)`): un paquete no puede
    leer el `ctx()` privado de `common-ai`. Ya no vale "registrar sin reescribir".
  - **El camino viejo muere cuando los ocho estén publicados**, no antes.
- **El tipo de extensión se llama `aitoolset`** (2026-09-17), minúscula y una palabra, como el resto de
  `EExtensionType`.
- **No hay tools sueltas** (2026-09-17): para gestionar una tool sola, un toolset de una tool.
- **La agrupación del selector ES el toolset** (2026-09-17). No hay taxonomía de familias aparte: tener las
  dos serían dos taxonomías paralelas sobre las mismas tools.
- 🔴 **Los choques de nombre se resuelven por PRECEDENCIA, no renombrando** (2026-09-17, decisión del
  usuario). Ver abajo.

### Precedencia entre toolsets (2026-09-17)

Dos toolsets pueden traer una tool con el mismo nombre. No se renombra ninguna: **manda el orden en que
están asignados al plugin**.

```
instalados: ts1(ta tb tc td)  ts2(tf td tg)  ts3(...)
asignados al plugin: [ts1, ts2]        ← el ORDEN es configuración, no adorno

efectivas: ta tb tc td(ts1) tf tg      ← td de ts2 queda TAPADA
```

Por qué así y no cualificando el nombre de cara al modelo: el nombre que viaja al LLM tiene que casar
`^[a-zA-Z0-9_-]{1,64}$` —una barra no pasa el filtro del proveedor— y cualificar las 43 (`k8s_obs__get_pod_logs`)
cambiaría el comportamiento de los agentes de hoy, cuyos prompts las nombran, sin ganar nada.

**Dos nombres distintos, y no se mezclan**:

| | Quién lo usa | Ejemplo |
|---|---|---|
| Referencia cualificada | Lo que se PERSISTE: techo del plugin, tools apagadas, agentes | `k8s-observability/get_pod_logs` |
| Nombre para el modelo | Lo que viaja al LLM en cada petición | `get_pod_logs` |

**Desactivar una tool NO mata el nombre: deja aflorar la siguiente.** La precedencia se calcula sobre las
tools HABILITADAS, porque se apaga una referencia concreta (`ts1/td`), no un nombre. Para que `td`
desaparezca del todo hay que apagar las dos.

```
asignados: [ts1, ts2]   apagada: ts1/td
efectivas: ta tb tc  td(ts2)  tf tg        ← aflora la de ts2
```

🔴 **Todo esto tiene que VERSE en el editor** (S5) — es la parte que el usuario marcó como importante, y sin
ella la precedencia es una trampa:

- Una tool tapada se muestra **marcada como tapada, y por quién**. Si no, el admin apaga `ts2/td` creyendo
  que hace algo, y no hacía nada: ya estaba tapada.
- Reordenar los toolsets **cambia qué código se ejecuta**, así que el editor debe decirlo al reordenar.
- Al apagar una tool que estaba tapando a otra, hay que avisar de que **aflora la de abajo**.
- La traza de cada invocación registra **qué toolset la sirvió**, no solo el nombre de la tool.

⚠️ **Riesgo asumido**: si un toolset publica una versión nueva que añade una tool con un nombre que ya
servía otro de menor precedencia, el tapado cambia **sin que nadie toque la configuración**. Es el precio de
la precedencia; se compensa haciéndolo visible, no evitándolo.

### Reparto de las 43 en 8 toolsets

**Documentacion de consulta**: este es el mapa completo, con los nombres de las tools de cada categoria y
la capability que necesita cada toolset. Se mantiene al dia segun se van creando.

| # | `aitoolset` | Requires | N | Tools | Estado |
|---|---|---|---|---|---|
| 1 | `k8s-inventory` | `K8S` | 8 | `list_namespaces` · `get_cluster_data` · `get_node_data` · `get_workload_data` · `get_space_data` · `list_services` · `list_ingresses` · `get_workload_config_refs` | ✅ 0.1.0 publicado |
| 2 | `k8s-describe` | `K8S` | 11 | `describe_pod` · `describe_service` · `describe_ingress` · `describe_controller` · `get_pod_yaml` · `get_deployment_yaml` · `get_controller_yaml` · `get_service_yaml` · `get_ingress_yaml` · `get_namespace_yaml` · `get_rollout_history` | ⬜ S3 |
| 3 | `k8s-metrics` | `K8S` + `METRICS` | 7 | `get_cluster_usage` · `get_node_usage` · `get_deployment_usage` · `get_prev_cluster_usage` · `get_prev_node_usage` · `get_prev_deployment_usage` · `get_prev_space_data` | ⬜ S3 |
| 4 | `k8s-observability` | `K8S` + `EVENTS` | 3 | `get_cluster_events` · `get_object_events` · `get_pod_logs` | ⬜ S3 |
| 5 | `k8s-secrets` | `K8S` | 3 | `get_configmap` · `get_secret` · `get_certificate_info` | ⬜ S3 |
| 6 | `k8s-ops` | `K8S` | 8 | `add_node` · `remove_node` · `stop_node` · `start_node` · `add_replica` · `remove_replica` · `restart_deployment` · `delete_pod` | ⬜ S3 |
| 7 | `source-repos` | `REPOS` | 1 | `get_source_file` | ⬜ S3 |
| 8 | `playground` | *(ninguna)* | 2 | `times_two` · `father_of` | ✅ 0.1.0 publicado |

Suman 43. Cuatro observaciones que hacen que el reparto no sea arbitrario:

- **`k8s-ops` es exactamente el conjunto WRITE.** Negar ese toolset a un plugin es negar toda la escritura,
  sin depender de que nadie marque bien un flag tool por tool.
- **`k8s-secrets` merece existir aunque sus tres tools sean READ.** Es el caso que justifica
  `sensitivity`: `get_secret` no modifica nada y expone todo.
- **`playground` es el `examples` que proponia este plan**, renombrado al crearlo. `times_two` devuelve
  `data * 2` y `father_of` devuelve la cadena `'Julio'` para cualquier entrada. Hoy, con `autoTools`, se
  le ofrecen al modelo como las demas. Aislarlas en un toolset que nadie activa es lo minimo; borrarlas es
  lo honesto.
- **El que no pide nada tambien informa**: `playground` con `requires: []` es la prueba de que la
  declaracion significa algo — si recibiera cluster, el reparto por capability seria decorativo.

⚠️ **Las 43 originales siguen en `common-ai` y NO se tocan** hasta S3: los toolsets nuevos llevan copias
propias escritas contra el contrato nuevo. El camino viejo (`ctx()` sobre AsyncLocalStorage) muere cuando
haya donde aterrizar, no antes.

## Preguntas abiertas

1. **`autoTools`** (S4): ¿"todas las READ" o "todas las de los toolsets activos"? Afecta a agentes ya
   configurados.
2. **Permisos** (S3): ¿basta un scope de cluster que ya exista, o hace falta uno propio de IA? ¿Y las
   destructivas piden confirmación humana, o solo permiso?
3. **Capacidades** (S2): ~~el catálogo inicial de `ECapability`~~ **validado en parte (2026-09-16)**: las 8 de
   `k8s-inventory` se sirven enteras con `K8S`, y la fachada no se quedó corta. Quedan por ejercitar
   `METRICS`, `EVENTS` y `REPOS`, cada una al migrar su toolset (`k8s-metrics`, `k8s-observability`,
   `source-repos`). ⚠️ `k8s-describe` y `k8s-ops` usarán clientes que la fachada **hoy no presta** (crd, rbac,
   exec, logs): ampliarla es parte de esos toolsets, y cada ampliación es una decisión, no un trámite.
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

~~📌 La **vista de lista** del gestor generico se ha validado con **un solo** `aitoolset` publicado
(`playground`, QA del 2026-09-16). La alineacion de columnas solo se ve de verdad con varias filas de
anchos distintos, asi que **hay que volver a revisarla** cuando haya mas toolsets en el catalogo.~~
**HECHO el mismo 2026-09-16**, al publicar `k8s-inventory`: ya es un test de e2e que mide la X de la celda
de version de cada fila del catalogo (y las dos filas traen distinto numero de chips, que es lo que
descuadraria una maquetacion por fila). ⚠️ Se mide DENTRO de una seccion: instalados y disponibles son dos
rejillas distintas y sus columnas no tienen por que coincidir.
