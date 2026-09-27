import { IConfigMaps } from './IConfigMap'
import { ISecrets } from './ISecrets'
import { IProviderStorage } from '../providers/IProvider'

/*
    Persistence for providers, the equivalent of what channels receive through IBackChannelObject.

    A provider owns its configuration: it decides IN CODE what goes to a Secret (credentials) and what
    goes to a ConfigMap (the rest), calling with secret=true or secret=false. The core interprets nothing.

    Namespaces:
      - the provider's own : 'kwirth-store-provider-<id>'  (it does not collide with the channels' one,
                             which uses 'kwirth-store-channel-<id>', nor with the core-managed config,
                             which uses 'kwirth-provider-<id>-config')
      - common             : 'kwirth-store-common-<id>'    (the SAME one channels and AiConfigApi use:
                             it is the store shared between extensions)
*/

const PROVIDER_PREFIX = 'kwirth-store-provider-'
const COMMON_PREFIX = 'kwirth-store-common-'

const writeTo = async (configMaps: IConfigMaps, secrets: ISecrets, name: string, secret: boolean, data: any): Promise<void> => {
    if (secret) {
        const base64Data = Buffer.from(JSON.stringify(data), 'utf8').toString('base64')
        await secrets.write(name, { data: base64Data })
    }
    else {
        await configMaps.write(name, JSON.stringify(data))
    }
}

const readFrom = async (configMaps: IConfigMaps, secrets: ISecrets, name: string, secret: boolean): Promise<any> => {
    if (secret) {
        const content = await secrets.read(name)
        if (content && content['data']) {
            const decodedString = Buffer.from(content['data'], 'base64').toString('utf8')
            return JSON.parse(decodedString)
        }
        return undefined
    }
    else {
        const content = await configMaps.read(name)
        if (content) return JSON.parse(content)
        return undefined
    }
}

export const buildProviderStorage = (configMaps: IConfigMaps, secrets: ISecrets): IProviderStorage => {
    return {
        writeStorage: async (id: string, secret: boolean, data: any) => writeTo(configMaps, secrets, PROVIDER_PREFIX + id, secret, data),
        readStorage: async (id: string, secret: boolean) => readFrom(configMaps, secrets, PROVIDER_PREFIX + id, secret),
        writeStorageCommon: async (id: string, secret: boolean, data: any) => writeTo(configMaps, secrets, COMMON_PREFIX + id, secret, data),
        readStorageCommon: async (id: string, secret: boolean) => readFrom(configMaps, secrets, COMMON_PREFIX + id, secret)
    }
}
