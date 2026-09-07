import { IProviderStorage } from '@kwirthmagnify/kwirth-common-back'
import { EAuthType, IHttpAuth, IHttpPullConfig } from '../common/HttpPullPush'

/*
    Persistencia de las conexiones, partida por sensibilidad — el mismo criterio que usan los canales
    (montag/censor guardan sus '*-configs' en ConfigMap y las credenciales de sus proveedores en Secret):

      - 'http-pull-push-configs' (secret=false) -> ConfigMap: nombres, urls, intervalos, cabeceras, flags.
        Sigue siendo inspeccionable con kubectl, que es util para auditar que se esta consultando.
      - 'http-pull-push-creds'   (secret=true)  -> Secret: password, token y valor de cabecera.

    Al leer se recomponen las dos mitades. Una credencial huerfana (su conexion ya no existe) se descarta.
*/

const STORAGE_CONFIGS = 'http-pull-push-configs'
const STORAGE_CREDS = 'http-pull-push-creds'

// La mitad secreta de unas credenciales, indexada por nombre de conexion.
interface IStoredCredential {
    password?: string
    token?: string
    headerValue?: string
}

type TStoredCredentials = Record<string, IStoredCredential>

const splitAuth = (auth: IHttpAuth): { publicPart: IHttpAuth, secretPart: IStoredCredential } => {
    const { password, token, headerValue, ...rest } = auth ?? { type: EAuthType.NONE }
    const secretPart: IStoredCredential = {}
    if (password) secretPart.password = password
    if (token) secretPart.token = token
    if (headerValue) secretPart.headerValue = headerValue
    return { publicPart: rest as IHttpAuth, secretPart }
}

export class ConfigStore {
    private storage: IProviderStorage | undefined

    constructor(storage: IProviderStorage | undefined) {
        this.storage = storage
    }

    get available(): boolean {
        return this.storage !== undefined
    }

    load = async (): Promise<IHttpPullConfig[]> => {
        if (!this.storage) return []
        const configs: IHttpPullConfig[] = (await this.storage.readStorage(STORAGE_CONFIGS, false)) ?? []
        const creds: TStoredCredentials = (await this.storage.readStorage(STORAGE_CREDS, true)) ?? {}
        return configs.map(config => {
            const credential = creds[config.name]
            if (!credential) return config
            return {
                ...config,
                auth: {
                    ...config.auth,
                    ...(credential.password ? { password: credential.password } : {}),
                    ...(credential.token ? { token: credential.token } : {}),
                    ...(credential.headerValue ? { headerValue: credential.headerValue } : {})
                }
            }
        })
    }

    save = async (configs: IHttpPullConfig[]): Promise<void> => {
        if (!this.storage) throw new Error('no storage available: this provider needs a Kwirth core that injects provider storage')
        const publicConfigs: IHttpPullConfig[] = []
        const creds: TStoredCredentials = {}
        for (const config of configs) {
            const { publicPart, secretPart } = splitAuth(config.auth)
            publicConfigs.push({ ...config, auth: publicPart })
            if (Object.keys(secretPart).length > 0) creds[config.name] = secretPart
        }
        await this.storage.writeStorage(STORAGE_CONFIGS, false, publicConfigs)
        await this.storage.writeStorage(STORAGE_CREDS, true, creds)
    }
}
