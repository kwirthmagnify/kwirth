import { AccessKey, accessKeyCreate, ApiKey, ILoginResponse, IUser } from '@kwirthmagnify/kwirth-common'
import { AuthorizationManagement } from '../AuthorizationManagement'
import { ApiKeyApi } from '../../api/ApiKeyApi'
import { ISecrets } from '../ISecrets'
import { IConfigMaps } from '../IConfigMap'

/*
    Identity issuance shared by the different authentication methods (kwirth login and IdP connectors).
    All the logic that decides/issues AccessKeys lives here (the core's trusted code).
*/
export class IdentityService {

    // reads the users secret (with the historical 'kwirth.users' fallback) and returns it RE-INDEXED by
    // the user's real id (decoded from each value), not by the Secret's key. The key of a K8s Secret's
    // data does not admit '@' (emails), so it is stored as base64url(id) (see writeUsers); here we undo
    // that detail so that callers use users[id].
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

    // persists the users map into the secret using base64url(id) as the data's key (a charset valid for
    // K8s Secret keys), with the value = base64(JSON(user)) untouched.
    static writeUsers = async (secrets: ISecrets, users: { [username:string]:string }): Promise<void> => {
        const data:{ [key:string]:string } = {}
        for (const [id, value] of Object.entries(users)) {
            data[Buffer.from(id, 'utf8').toString('base64url')] = value
        }
        await secrets.write('kwirth-users', data)
    }

    // locates and deserialises a user by their id (username = email in IdP users)
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

    // creates and persists a 'permanent' AccessKey (24h) for the user, and refreshes apiKeyApi's cache
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
