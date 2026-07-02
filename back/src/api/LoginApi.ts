import express, { Request, Response} from 'express'
import Semaphore from 'ts-semaphore'
import { ApiKeyApi } from './ApiKeyApi'
import { IUser } from '@kwirthmagnify/kwirth-common'
import { ISecrets } from '../tools/ISecrets'
import { IConfigMaps } from '../tools/IConfigMap'
import { IdentityService } from '../tools/auth/IdentityService'

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
                    if (req.body.password === user.password) {
                        if (user.id === 'admin' && user.password === 'password')
                            res.status(201).send()
                        else {
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
                    }
                    else {
                        res.status(401).json({})
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
                        if (req.body.password===user.password) {
                            user.password = req.body.newpassword
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
                            res.status(401).send()
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
