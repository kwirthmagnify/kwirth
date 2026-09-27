import { IProviderStorage } from '@kwirthmagnify/kwirth-common-back'
import { EAuthType, IHttpAuth, IHttpPullConfig } from '../common/HttpPullPush'

/*
    Persistence of the connections, split by sensitivity — the same criterion the channels use
    (montag/censor store their '*-configs' in a ConfigMap and their providers' credentials in a Secret):

      - 'http-pull-push-configs' (secret=false) -> ConfigMap: names, urls, intervals, headers, flags.
        It stays inspectable with kubectl, which is useful for auditing what is being queried.
      - 'http-pull-push-creds'   (secret=true)  -> Secret: password, token and header value.

    On reading, the two halves are put back together. An orphaned credential (its connection no longer
    exists) is discarded.
*/

const STORAGE_CONFIGS = 'http-pull-push-configs'
const STORAGE_CREDS = 'http-pull-push-creds'

// The secret half of a set of credentials, indexed by connection name.
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
