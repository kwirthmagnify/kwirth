import { IBackChannelObject } from '@kwirthmagnify/kwirth-common'
import { ILlm, ILlmModel, ILlmProvider } from './index'
import { LanguageModel } from 'ai'
import { z } from 'zod'
import { createOpenAI } from '@ai-sdk/openai'
import { createGroq } from '@ai-sdk/groq'
import { createMistral } from '@ai-sdk/mistral'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'

export const buildModel = (llm: ILlm, providers: ILlmProvider[]): LanguageModel | null => {
    const key = llm.useProviderKey ? providers.find(p => p.name === llm.provider)?.key : llm.key
    if (!key) {
        console.log('Could not find a key')
        return null
    }
    switch (llm.provider) {
        case 'openai': return createOpenAI({ apiKey: key })(llm.model)
        case 'groq': return createGroq({ apiKey: key })(llm.model)
        case 'mistral': return createMistral({ apiKey: key })(llm.model)
        case 'google': return createGoogleGenerativeAI({ apiKey: key })(llm.model)
        case 'deepseek': return createDeepSeek({ apiKey: key })(llm.model)
        case 'openrouter': return createOpenRouter({ apiKey: key })(llm.model)
        default: 
            console.log('Invalid provider', llm.provider)
            return null
    }
}

export const loadModels = async (providers: ILlmProvider[], log: IBackChannelObject) => {
    log.logInfo?.('Loading AI models...')
    for (const provider of providers) {
        try {
            switch (provider.name) {
                case 'deepseek': {
                    const resp = await fetch('https://api.deepseek.com/models', { headers: { Authorization: 'Bearer ' + provider.key } })
                    const data = await resp.json()
                    provider.models = data.data.filter((m: { object: string }) => m.object === 'model').map((m: { id: string; description: string }) => ({
                        id: m.id, name: m.id, description: m.description, type: 'text'
                    } satisfies ILlmModel))
                    break
                }
                case 'google': {
                    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${provider.key}`)
                    const data = await resp.json()
                    provider.models = data.models.map((m: { name: string; displayName: string; description: string }) => ({
                        id: m.name.startsWith('models/') ? m.name.substring(7) : m.name,
                        name: m.displayName,
                        description: m.description,
                        type: 'text'
                    } satisfies ILlmModel))
                    break
                }
                case 'groq': {
                    const resp = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: 'Bearer ' + provider.key } })
                    const data = await resp.json()
                    provider.models = data.data.filter((m: { object: string; active: boolean }) => m.object === 'model' && m.active).map((m: { id: string; description: string }) => ({
                        id: m.id, name: m.id, description: m.description, type: 'text'
                    } satisfies ILlmModel))
                    break
                }
                case 'openai': {
                    const resp = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: 'Bearer ' + provider.key } })
                    const data = await resp.json()
                    provider.models = data.data.filter((m: { object: string }) => m.object === 'model').map((m: { id: string; description: string }) => ({
                        id: m.id, name: m.id, description: m.description, type: 'text'
                    } satisfies ILlmModel))
                    break
                }
                case 'openrouter': {
                    const resp = await fetch('https://openrouter.ai/api/v1/models', { headers: { Authorization: 'Bearer ' + provider.key } })
                    const data = await resp.json()
                    provider.models = data.data.map((m: { id: string; name: string; description: string }) => ({
                        id: m.id, name: m.name, description: m.description, type: 'text'
                    } satisfies ILlmModel))
                    break
                }
                case 'mistral': {
                    const resp = await fetch('https://api.mistral.ai/v1/models', { headers: { Authorization: 'Bearer ' + provider.key } })
                    const data = await resp.json()
                    provider.models = data.data.filter((m: { object: string }) => m.object === 'model').map((m: { id: string; description: string; capabilities?: { completion_chat?: boolean } }) => ({
                        id: m.id, name: m.id, description: m.description,
                        type: m.capabilities?.completion_chat === true ? 'text' : 'other'
                    } satisfies ILlmModel))
                    break
                }
                case 'kwirth':
                    provider.models = [
                        { id: 'alberto-1-flash-gordon-lite', name: 'Alberto model quick response', description: 'Albert #1 model', type: 'text' },
                        { id: 'alberto-1.5-python-forever', name: 'Alberto model legacy frameworks', description: 'Albert Pythoneer', type: 'text' }
                    ]
                    break
                default:
                    log.logWarning?.(`Provider '${provider.name}' is not implemented, will not be available.`)
            }
            log.logInfo?.(`Provider '${provider.name}' loaded ${provider.models.length} models`)
        }
        catch (err) {
            log.logError?.(`Error loading models from provider '${provider.name}': ${err}`)
        }
    }
}

const inferZod = (value: unknown): z.ZodTypeAny => {
    if (Array.isArray(value))
        return value.length > 0 ? z.array(inferZod(value[0])) : z.array(z.unknown())
    if (typeof value === 'string')  return z.string()
    if (typeof value === 'number')  return z.number()
    if (typeof value === 'boolean') return z.boolean()
    if (value !== null && typeof value === 'object')
        return zodFromExample(value as Record<string, unknown>)
    return z.unknown()
}

// Re-export AI SDK symbols so plugins can use them without bundling the SDK
export { generateText, Output, stepCountIs, tool } from 'ai'
export { z } from 'zod'

export const zodFromExample = (example: Record<string, unknown>): z.ZodObject<Record<string, z.ZodTypeAny>> => {
    const shape: Record<string, z.ZodTypeAny> = {}
    for (const [key, value] of Object.entries(example)) {
        shape[key] = inferZod(value)
    }
    return z.object(shape)
}
