import express, { Request, Response} from 'express'
import Semaphore from 'ts-semaphore'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { ApiKeyApi } from './ApiKeyApi'
import { IUser } from '@kwirthmagnify/kwirth-common'
import { ISecrets } from '../tools/ISecrets'
import { IConfigMaps } from '../tools/IConfigMap'
import { IdentityService } from '../tools/auth/IdentityService'
import { guard } from '../tools/RequestGuard'
import { ELogComponent } from '../tools/Logging'

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex')

// verifies the incoming password (sha256) against the stored value (a legacy plain one or a modern bcrypt)
// returns { valid, migrate, firstLogin }
// migrate=true → the stored value was plain text; it has to be re-hashed and saved
// firstLogin=true → an admin whose default password has not been changed
const verifyPassword = async (incoming: string, stored: string, userId: string) => {
    if (stored.startsWith('$2b$')) {
        const valid = await bcrypt.compare(incoming, stored)
        return { valid, migrate: false, firstLogin: false }
    }
    // a legacy plain-text value: the front end already sends sha256, so we compare sha256(stored)
    const valid = sha256(stored) === incoming
    const firstLogin = valid && userId === 'admin' && stored === 'password'
    return { valid, migrate: valid, firstLogin }
}

export class LoginApi {
    secrets: ISecrets
    configMaps: IConfigMaps
    apiKeyApi: ApiKeyApi
    static semaphore:Semaphore = new Semaphore(1)
    public router = express.Router()

    constructor (secrets: ISecrets, configMaps: IConfigMaps, apiKeyApi:ApiKeyApi) {
        this.secrets = secrets
        this.configMaps = configMaps
        this.apiKeyApi = apiKeyApi

        // authentication (login)
        this.router.post('/', async (req:Request,res:Response) => {
            guard(LoginApi.semaphore.use ( async () => {
                let users = await IdentityService.readUsers(this.secrets)
                if (!users) {
                    console.error('Cannot access kwirth users on /')
                    res.status(401).json()
                    return
                }

                if (!users[req.body.user]) {
                    res.status(401).json()
                    return
                }
                let user:IUser = JSON.parse(atob(users[req.body.user]))
                if (user) {
                    const { valid, migrate, firstLogin } = await verifyPassword(req.body.password, user.password, user.id)
                    if (!valid) {
                        res.status(401).json({})
                        return
                    }
                    if (firstLogin) {
                        res.status(201).send()
                        return
                    }
                    if (migrate) {
                        user.password = await bcrypt.hash(req.body.password, 10)
                        users[req.body.user] = btoa(JSON.stringify(user))
                        await IdentityService.writeUsers(this.secrets, users)
                    }
                    let ip = (req as any).clientIp || req.headers['x-forwarded-for'] || req.socket.remoteAddress
                    let newApiKey = await IdentityService.createApiKey(user, ip, this.configMaps, this.apiKeyApi)
                    if (newApiKey) {
                        user.accessKey = newApiKey.accessKey
                        res.status(200).json(IdentityService.okResponse(user))
                    }
                    else {
                        console.log('Error creating api key')
                        res.status(500).json({})
                    }
                }
                else {
                    res.status(403).json({})
                }
            }), res, ELogComponent.CORE)
        })

        // change password
        //
        // Without a try/catch on purpose, just like the login above: the guard is the only one
        // responsible for the unexpected. The catch that used to be here logged the error and returned
        // WITHOUT answering, so the request hung forever — and, by resolving the promise normally, it
        // did not let the guard act either. Right in the first-startup flow, where the admin is forced
        // to change the default password.
        this.router.post('/password', async (req:Request,res:Response) => {
            guard(LoginApi.semaphore.use ( async () => {
                let users = await IdentityService.readUsers(this.secrets)
                if (!users) {
                    console.error('Cannot access kwirth users for changini password')
                    res.status(401).json()
                    return
                }

                if (!users[req.body.user]) {
                    res.status(401).json()
                    return
                }

                let user:IUser = JSON.parse (atob(users[req.body.user]))
                if (user) {
                    const { valid } = await verifyPassword(req.body.password, user.password, user.id)
                    if (!valid) {
                        res.status(401).send()
                        return
                    }
                    user.password = await bcrypt.hash(req.body.newpassword, 10)
                    let ip = (req as any).clientIp || req.headers['x-forwarded-for'] || req.socket.remoteAddress
                    let newApiKey = await IdentityService.createApiKey(user, ip, this.configMaps, this.apiKeyApi)
                    if (newApiKey) {
                        user.accessKey=newApiKey.accessKey
                        users[req.body.user]=btoa(JSON.stringify(user))
                        await IdentityService.writeUsers(this.secrets, users)
                        res.status(200).json(IdentityService.okResponse(user))
                    }
                    else {
                        console.log('Error creating api key')
                        res.status(500).json({})
                    }
                }
                else {
                    res.status(403).send()
                }
            }), res, ELogComponent.CORE)
        })

    }

}
