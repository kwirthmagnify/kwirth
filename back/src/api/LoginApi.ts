import express, { Request, Response} from 'express'
import Semaphore from 'ts-semaphore'
import bcrypt from 'bcrypt'
import crypto from 'crypto'
import { ApiKeyApi } from './ApiKeyApi'
import { IUser } from '@kwirthmagnify/kwirth-common'
import { ISecrets } from '../tools/ISecrets'
import { IConfigMaps } from '../tools/IConfigMap'
import { IdentityService } from '../tools/auth/IdentityService'

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex')

// verifica la contraseña entrante (sha256) contra el valor almacenado (plain heredado o bcrypt moderno)
// devuelve { valid, migrate, firstLogin }
// migrate=true → el valor almacenado era texto plano; hay que re-hashear y guardar
// firstLogin=true → admin con contraseña por defecto sin cambiar
const verifyPassword = async (incoming: string, stored: string, userId: string) => {
    if (stored.startsWith('$2b$')) {
        const valid = await bcrypt.compare(incoming, stored)
        return { valid, migrate: false, firstLogin: false }
    }
    // valor heredado en texto plano: el front ya envía sha256, así que comparamos sha256(stored)
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
            LoginApi.semaphore.use ( async () => {
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
            })
        })

        // change password
        this.router.post('/password', async (req:Request,res:Response) => {
            LoginApi.semaphore.use ( async () => {
                try {
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
                }
                catch (err) {
                    console.log('Error updating password')
                    console.log(err)
                }
            })
        })

    }

}
