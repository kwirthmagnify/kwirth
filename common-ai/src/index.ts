export const STORAGE_KEY_PROVIDERS = 'kwirth-ai-providers'
export const STORAGE_KEY_LLMS = 'kwirth-ai-llms'
export const PROVIDERS_AVAILABLE = ['google', 'openai', 'openrouter', 'mistral', 'groq', 'deepseek']

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
