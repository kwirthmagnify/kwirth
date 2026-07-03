import express, { Request, Response} from 'express'
import Semaphore from 'ts-semaphore'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'
import { ApiKeyApi } from './ApiKeyApi'
import { ISecrets } from '../tools/ISecrets'
import { IdentityService } from '../tools/auth/IdentityService'

export class UserApi {
    secrets: ISecrets
    static semaphore: Semaphore = new Semaphore(1)
    public router = express.Router()

    // delega en IdentityService: re-indexa por id real y gestiona la codificación base64url de la clave
    readUsersSecret = async (secrets: ISecrets) => {
        return IdentityService.readUsers(secrets)
    }

    constructor (secrets: ISecrets, apiKeyApi: ApiKeyApi) {
        this.secrets=secrets

        this.router.route('/')
            .all( async (req:Request,res:Response, next) => {
                if (! (await AuthorizationManagement.validKey(req, res, apiKeyApi))) return
                // gestión de usuarios es operación administrativa: exige scope 'admin'
                if (!AuthorizationManagement.hasScope(req, 'admin')) { res.status(403).json({ error: 'admin scope required' }); return }
                next()
            })
            .get( (req:Request,res:Response) => {
                UserApi.semaphore.use ( async () => {
                    try {
                        let users = await this.readUsersSecret(this.secrets)
                        if (users) {
                            res.status(200).json(Object.keys(users))
                        }
                        else {
                            res.status(400).json([])
                        }
                    }
                    catch (err) {
                        res.status(500).json()
                        console.log(err)
                    }
                })
            })
            .post( (req:Request,res:Response) => {
                UserApi.semaphore.use ( async () => {
                    try {
                        let users = await this.readUsersSecret(this.secrets)
                        if (!users) {
                            res.status(400).json([])
                            return
                        }
                        users[req.body.id]=btoa(JSON.stringify(req.body))
                        await IdentityService.writeUsers(this.secrets, users)
                        res.status(200).json()
                    }
                    catch (err) {
                        res.status(500).json()
                        console.log(err)
                    }
                })
            })

      this.router.route('/:user')
        .all( async (req:Request,res:Response, next) => {
            if (! (await AuthorizationManagement.validKey(req, res, apiKeyApi))) return
            if (!AuthorizationManagement.hasScope(req, 'admin')) { res.status(403).json({ error: 'admin scope required' }); return }
            next()
        })
        .get( (req:Request,res:Response) => {
            UserApi.semaphore.use ( async () => {
                try {
                    let users = await this.readUsersSecret(this.secrets)
                    if (!users) {
                        res.status(400).json([])
                        return
                    }
                    res.status(200).send(atob(users[req.params.user]))
                }
                catch (err) {
                    res.status(500).send()
                    console.log(err)
                }
            })
        })
        .delete( (req:Request,res:Response) => {
            try {
                UserApi.semaphore.use ( async () => {
                    let users = await this.readUsersSecret(this.secrets)
                    if (!users) {
                        res.status(400).json([])
                        return
                    }
                    delete users[req.params.user]
                    await IdentityService.writeUsers(this.secrets, users)
                    res.status(200).json()
                });
            }      
            catch (err) {
                res.status(500).json()
                console.log(err)
            }
        })
        .put( (req:Request,res:Response) => {
            UserApi.semaphore.use ( async () => {
                try {
                    let users = await this.readUsersSecret(this.secrets)
                    if (!users) {
                        res.status(400).json([])
                        return
                    }
                    users[req.body.id]=btoa(JSON.stringify(req.body))
                    await IdentityService.writeUsers(this.secrets, users)
                    res.status(200).json()
                }
                catch (err) {
                    console.log(err)
                    res.status(500).json()
                }
            })
        })
    }
}
