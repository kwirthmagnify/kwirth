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
    name: string
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
