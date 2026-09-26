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
// AI toolset contract (plan: plans/ai-tools/PLAN.md, S1)
//
// The unit is the TOOLSET, not the tool: no tool is reachable outside one. To manage a single tool you
// package a toolset holding just that tool, and so the notion of a 'loose tool' does not exist in the
// model, in the configuration, or in the UI.
//
// What lives here is ISOMORPHIC: what it takes to DECIDE about a tool (show it, group it, authorize it,
// configure it). What it takes to RUN it — inputSchema and execute — lives in back.ts, because the front
// end neither needs it nor should load it.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** What a tool does to the world. */
export enum EToolEffect {
    READ = 'read',
    WRITE = 'write'
}

// What a tool EXPOSES, which is not the same as what it does to the world. The case that forces the split
// is get_secret: it reads Kubernetes Secrets, so it is READ and it is the most dangerous thing in the
// catalogue. With a single dimension there is no way to deny it without also denying 'list namespaces'.
export enum EToolSensitivity {
    PUBLIC = 'public',          // inventory, shapes, names
    INTERNAL = 'internal',      // configuration, events, logs
    SECRET = 'secret'           // credentials and sensitive material
}

// What a toolset needs from the host in order to work. The host provisions ONLY what was declared, which
// is what avoids today's catch-all (seven fields everyone receives just in case, with 'sourceRepos'
// existing for one single tool out of the 43).
export enum ECapability {
    K8S = 'k8s',                // cluster access
    METRICS = 'metrics',        // metrics, current and historical
    EVENTS = 'events',          // cluster event buffer
    REPOS = 'repos'             // source repository credentials
}

/** Separator of a qualified reference to a tool: '<toolset>/<tool>'. */
export const TOOL_REF_SEPARATOR = '/'

// ⚠️ A tool is ALWAYS referenced qualified by its toolset ('k8s-inventory/list_namespaces'), never by its
// bare name. This is what gets persisted in agent and ceiling configuration, so it cannot turn ambiguous
// the day two third-party toolsets both bring a 'get_pod_logs'.
export const toolRef = (toolsetId: string, toolName: string): string =>
    `${toolsetId}${TOOL_REF_SEPARATOR}${toolName}`

export const parseToolRef = (ref: string): { toolsetId: string, toolName: string } | undefined => {
    const i = ref.indexOf(TOOL_REF_SEPARATOR)
    if (i <= 0 || i === ref.length - 1) return undefined
    return { toolsetId: ref.slice(0, i), toolName: ref.slice(i + 1) }
}

/** A tool, without what it takes to run it. This is what travels to the front end. */
export interface IAiToolInfo {
    name: string
    description: string
    effect: EToolEffect
    sensitivity: EToolSensitivity
}

/** A toolset, without what it takes to run its tools. This is what travels to the front end. */
export interface IAiToolsetInfo {
    id: string
    version: string
    displayName: string
    description: string
    requires: ECapability[]
    tools: IAiToolInfo[]
}

// A plugin's ceiling, in two layers: the toolsets it may use, minus the tools turned off inside them.
// The plugin stores it along with the rest of ITS configuration; the core only provides the editor.
export interface IToolsetConfig {
    activeToolsets: string[]    // toolset ids
    disabledTools: string[]     // qualified references '<toolset>/<tool>'
}
