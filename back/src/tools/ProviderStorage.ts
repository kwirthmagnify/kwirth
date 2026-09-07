import { IConfigMaps } from './IConfigMap'
import { ISecrets } from './ISecrets'
import { IProviderStorage } from '../providers/IProvider'

/*
    Persistencia para providers, equivalente a la que reciben los canales via IBackChannelObject.

    Un provider es dueño de su configuracion: decide EN CODIGO que va a un Secret (credenciales) y que
    va a un ConfigMap (el resto), llamando con secret=true o secret=false. El core no interpreta nada.

    Espacios de nombres:
      - propio del provider : 'kwirth-store-provider-<id>'  (no colisiona con el de canales, que usa
                              'kwirth-store-channel-<id>', ni con la config gestionada por el core, que
                              usa 'kwirth-provider-<id>-config')
      - comun               : 'kwirth-store-common-<id>'    (el MISMO que usan canales y AiConfigApi:
                              es el almacen compartido entre extensiones)
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
