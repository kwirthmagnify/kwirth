import { AccessKey, accessKeyCreate, ApiKey, ILoginResponse, IUser } from '@kwirthmagnify/kwirth-common'
import { AuthorizationManagement } from '../AuthorizationManagement'
import { ApiKeyApi } from '../../api/ApiKeyApi'
import { ISecrets } from '../ISecrets'
import { IConfigMaps } from '../IConfigMap'

/*
    Emisión de identidad compartida por los distintos métodos de autenticación (login kwirth y conectores IdP).
    Toda la lógica que decide/emite AccessKeys vive aquí (código de confianza del core).
*/
export class IdentityService {

    // lee el secret de usuarios (con el fallback histórico 'kwirth.users') y lo devuelve
    // RE-INDEXADO por el id real del usuario (decodificado de cada valor), no por la clave del
    // Secret. La clave del data de un Secret de K8s no admite '@' (emails), así que se guarda como
    // base64url(id) (ver writeUsers); aquí deshacemos ese detalle para que los callers usen users[id].
    static readUsers = async (secrets: ISecrets): Promise<{ [username:string]:string } | undefined> => {
        let raw:{ [key:string]:string }
        try {
            raw = await secrets.read('kwirth-users')
        }
        catch (err) {
            try {
                raw = await secrets.read('kwirth.users')
            }
            catch (err) {
                console.log(`*** Cannot read 'kwirth-users' secret on source ***`)
                return undefined
            }
        }
        if (!raw || typeof raw !== 'object') return undefined
        const users:{ [username:string]:string } = {}
        for (const value of Object.values(raw)) {
            if (typeof value !== 'string') continue
            try {
                const u = JSON.parse(atob(value))
                if (u && u.id) users[u.id] = value
            }
            catch (err) { /* valor corrupto: se ignora */ }
        }
        return users
    }

    // persiste el mapa de usuarios en el secret usando base64url(id) como clave del data
    // (charset válido para claves de Secret de K8s), con el valor = base64(JSON(user)) intacto.
    static writeUsers = async (secrets: ISecrets, users: { [username:string]:string }): Promise<void> => {
        const data:{ [key:string]:string } = {}
        for (const [id, value] of Object.entries(users)) {
            data[Buffer.from(id, 'utf8').toString('base64url')] = value
        }
        await secrets.write('kwirth-users', data)
    }

    // localiza y deserializa un usuario por su id (username = email en usuarios IdP)
    static findUser = (users: { [username:string]:string }, id: string): IUser | undefined => {
        if (!users[id]) return undefined
        try {
            return JSON.parse(atob(users[id])) as IUser
        }
        catch (err) {
            console.log(`Error deserializing user '${id}'`)
            return undefined
        }
    }

    // crea y persiste un AccessKey 'permanent' (24h) para el usuario, y refresca la cache de apiKeyApi
    static createApiKey = async (user: IUser, ip: string, configMaps: IConfigMaps, apiKeyApi: ApiKeyApi): Promise<ApiKey | undefined> => {
        try {
            let apiKey:ApiKey = {
                accessKey: accessKeyCreate('permanent', user.resources),
                description: `Login user '${user.id}' from ${ip}`,
                expire: Date.now() + 24*60*60*1000,
                days: 1,
                enabledChannels: user.enabledChannels?.length ? user.enabledChannels : undefined
            }
            let storedKeys = await configMaps.read('kwirth.keys', [])
            storedKeys = AuthorizationManagement.cleanApiKeys(storedKeys)
            storedKeys.push(apiKey)
            configMaps.write('kwirth.keys', storedKeys)
            apiKeyApi.apiKeys = storedKeys
            return apiKey
        }
        catch (err) {
            console.log('Error creating api key')
            return undefined
        }
    }

    static okResponse = (user: IUser): ILoginResponse => {
        let response:ILoginResponse = {
            id: user.id,
            name: user.name,
            accessKey: user.accessKey,
            startChannel: user.startChannel,
            exitFullScreen: user.exitFullScreen,
            enabledChannels: user.enabledChannels
        }
        return response
    }
}
