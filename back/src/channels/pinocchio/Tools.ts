import { IConfigModel, IConfigProvider } from './PinocchioConfig'

export const loadModels = async (providers:IConfigProvider[]) => {
    console.log('Pinocchio loading models...')
    for (let provider of providers) {
        try {
            switch(provider.name) {
                case 'deepseek':
                    const respDeepSeek = await fetch(`https://api.deepseek.com/models`, { headers: { Authorization: 'Bearer ' + provider.key}})
                    const dataDeepSeek = await respDeepSeek.json()
                    provider.models = dataDeepSeek.data.filter((model:any) => model.object==='model').map( (model:any) => {
                        return {
                            id: model.id,
                            name: model.id,
                            description: model.description,
                            type: 'text'
                        } satisfies IConfigModel
                    })
                    break
                case 'google':
                    const respGoogle = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${provider.key}`)
                    const dataGoogle = await respGoogle.json()
                    provider.models = dataGoogle.models.map((model: any) => {
                        return {
                            id: model.name.startsWith('models/') ? model.name.substring(7) : model.name,
                            name: model.displayName,
                            description: model.description,
                            type: 'text'
                        } satisfies IConfigModel
                    })
                    break
                case 'groq':
                    const respGroq = await fetch(`https://api.groq.com/openai/v1/models`, { headers: { Authorization: 'Bearer ' + provider.key}})
                    const dataGroq = await respGroq.json()
                    provider.models = dataGroq.data.filter((model:any) => model.object==='model' && model.active===true).map( (model:any) => {
                        return {
                            id: model.id,
                            name: model.id,
                            description: model.description,
                            type: 'text'
                        } satisfies IConfigModel
                    })
                    break
                case 'openai':
                    const respOpenai = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: 'Bearer ' + provider.key}})
                    const dataOpenai = await respOpenai.json()
                    provider.models = dataOpenai.data.filter((model:any) => model.object==='model').map( (model:any) => {
                        return { 
                            id: model.id,
                            name: model.id,
                            description: model.description,
                            type: 'text'
                        } satisfies IConfigModel
                    })
                    break
                case 'openrouter':
                    const respOpenRouter = await fetch(`https://openrouter.ai/api/v1/models`, { headers: { Authorization: 'Bearer ' + provider.key}})
                    const dataOpenRouter = await respOpenRouter.json()
                    provider.models = dataOpenRouter.data.map( (model:any) => {
                        return {
                            id: model.id,
                            name: model.name,
                            description: model.description,
                            type: 'text'
                        } satisfies IConfigModel
                    })
                    break
                case 'mistral':
                    const respMistral = await fetch('https://api.mistral.ai/v1/models', { headers: { Authorization: 'Bearer ' + provider.key}})
                    const dataMistral = await respMistral.json()
                    provider.models = dataMistral.data.filter((model:any) => model.object==='model').map( (model:any) => {
                        return { 
                            id: model.id,
                            name: model.id,
                            description: model.description,
                            type: model.capabilities?.completion_chat===true? 'text':'other'
                        } satisfies IConfigModel
                    })
                    break
                case 'kwirth':
                    provider.models = [
                        {
                            id: 'alberto-1-flash-gordon-lite',
                            name: 'Alberto model quick response',
                            description: 'Albert #1 model',
                            type: 'text'
                        },
                        {
                            id: 'alberto-1.5-python-forever',
                            name: 'Alberto model legacy frameworks',
                            description: 'Albert Pythoneer',
                            type: 'text'
                        }
                    ]
                    break
                default:
                    console.error(`Pinocchio: provider '${provider.name}' is not implemented in channel, will not be available.`)
            }
            console.log(`Pinocchio: '${provider.name}' provider added ${provider.models.length} models`)
        }
        catch (err) {
            console.error(`Pinocchio: error loading models from provider ${provider.name}`)
            console.log(err)
        }
    }
}
