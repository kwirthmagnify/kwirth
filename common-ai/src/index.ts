export const STORAGE_KEY_PROVIDERS = 'kwirth-ai-providers'
export const STORAGE_KEY_LLMS = 'kwirth-ai-llms'
export const PROVIDERS_AVAILABLE = ['google', 'openai', 'openrouter', 'mistral', 'groq', 'deepseek', 'anthropic', 'openai-compat']

export interface ILlmModel {
    id: string
    name: string
    description: string
    type: 'text' | 'image' | 'video' | 'other'
}

export interface ILlmProvider {
    name: string        // user-defined identifier (e.g. 'huawei-maas', 'my-openai'); referenced by ILlm.provider
    type: string        // SDK adapter type — must be one of PROVIDERS_AVAILABLE (defaults to name for legacy entries)
    key: string
    models: ILlmModel[]
    endpoint?: string   // used by 'openai-compat' providers (base URL of the OpenAI-compatible API)
}

export interface ILlm {
    id: string
    provider: string
    model: string
    temperature: number
    useProviderKey: boolean
    key: string
    inputCostPerMillion?: number
    outputCostPerMillion?: number
    data?: unknown
}

export const STORAGE_KEY_AGENTS = 'kwirth-ai-agents'

// An AI agent (bot) is config, not code: a row over the existing engine (buildModel + tools + runAgent).
// Reusable by Agora, pinocchio and defender.
export interface IAgent {
    id: string
    name: string
    description: string
    cluster: string
    llm: string
    system: string
    tools: string[]
    autoTools: boolean
    steps: number
    readOnly: boolean
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Contrato de toolsets de IA (plan: plans/ai-tools/PLAN.md, S1)
//
// La unidad es el TOOLSET, no la tool: ninguna tool es alcanzable fuera de uno. Para gestionar una tool
// sola se empaqueta un toolset con una sola tool, y asi no existe el concepto de 'tool suelta' ni en el
// modelo, ni en la configuracion, ni en la UI.
//
// Lo de aqui es ISOMORFICO: lo que hace falta para DECIDIR sobre una tool (mostrarla, agruparla,
// autorizarla, configurarla). Lo que hace falta para EJECUTARLA —inputSchema y execute— vive en back.ts,
// porque el front ni lo necesita ni debe cargarlo.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Que le hace una tool al mundo. */
export enum EToolEffect {
    READ = 'read',
    WRITE = 'write'
}

// Que EXPONE una tool, que no es lo mismo que que le hace al mundo. El caso que obliga a separarlo es
// get_secret: lee Secrets de Kubernetes, o sea que es READ y es lo mas peligroso del catalogo. Con una
// sola dimension no hay forma de denegarla sin denegar tambien 'listar namespaces'.
export enum EToolSensitivity {
    PUBLIC = 'public',          // inventario, formas, nombres
    INTERNAL = 'internal',      // configuracion, eventos, logs
    SECRET = 'secret'           // credenciales y material sensible
}

// Lo que un toolset necesita del host para funcionar. El host provisiona SOLO lo declarado, que es lo que
// evita el cajon de sastre de hoy (siete campos que recibe todo el mundo por si acaso, con 'sourceRepos'
// existiendo para una sola de las 43 tools).
export enum ECapability {
    K8S = 'k8s',                // acceso al cluster
    METRICS = 'metrics',        // metricas, actuales e historicas
    EVENTS = 'events',          // buffer de eventos del cluster
    REPOS = 'repos'             // credenciales de repositorios fuente
}

/** Separador de una referencia cualificada a una tool: '<toolset>/<tool>'. */
export const TOOL_REF_SEPARATOR = '/'

// ⚠️ Una tool se referencia SIEMPRE cualificada por su toolset ('k8s-inventory/list_namespaces'), nunca
// por su nombre a secas. Es lo que se persiste en la configuracion de agentes y techos, asi que no puede
// volverse ambiguo el dia que dos toolsets de terceros traigan los dos un 'get_pod_logs'.
export const toolRef = (toolsetId: string, toolName: string): string =>
    `${toolsetId}${TOOL_REF_SEPARATOR}${toolName}`

export const parseToolRef = (ref: string): { toolsetId: string, toolName: string } | undefined => {
    const i = ref.indexOf(TOOL_REF_SEPARATOR)
    if (i <= 0 || i === ref.length - 1) return undefined
    return { toolsetId: ref.slice(0, i), toolName: ref.slice(i + 1) }
}

/** Una tool, sin lo necesario para ejecutarla. Es lo que viaja al front. */
export interface IAiToolInfo {
    name: string
    description: string
    effect: EToolEffect
    sensitivity: EToolSensitivity
}

/** Un toolset, sin lo necesario para ejecutar sus tools. Es lo que viaja al front. */
export interface IAiToolsetInfo {
    id: string
    version: string
    displayName: string
    description: string
    requires: ECapability[]
    tools: IAiToolInfo[]
}

// El techo de un plugin, en dos capas: los toolsets que puede usar, menos las tools que se le apagan
// dentro de ellos. Lo guarda el plugin con el resto de SU configuracion; el core solo pone el editor.
export interface IToolsetConfig {
    activeToolsets: string[]    // ids de toolset
    disabledTools: string[]     // referencias cualificadas '<toolset>/<tool>'
}
