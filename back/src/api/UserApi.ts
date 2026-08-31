import express, { Request, Response} from 'express'
import Semaphore from 'ts-semaphore'
import bcrypt from 'bcryptjs'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'
import { ApiKeyApi } from './ApiKeyApi'
import { ISecrets } from '../tools/ISecrets'
import { IdentityService } from '../tools/auth/IdentityService'
import { unknownScopesIn } from '../tools/ScopeCatalog'

export class UserApi {
    secrets: ISecrets
    private validScopes?: () => Set<string>   // conjunto de scopes conocidos, para validar al guardar
    static semaphore: Semaphore = new Semaphore(1)
    public router = express.Router()

    // delega en IdentityService: re-indexa por id real y gestiona la codificación base64url de la clave
    readUsersSecret = async (secrets: ISecrets) => {
        return IdentityService.readUsers(secrets)
    }

    constructor (secrets: ISecrets, apiKeyApi: ApiKeyApi, validScopes?: () => Set<string>) {
        this.secrets=secrets
        this.validScopes=validScopes

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
                        const bad = this.validScopes ? unknownScopesIn(req.body?.resources ?? '', this.validScopes()) : []
                        if (bad.length) { res.status(400).json({ error: `Unknown scopes: ${bad.join(', ')}` }); return }
                        const user = { ...req.body, password: await bcrypt.hash(req.body.password, 10) }
                        users[user.id] = btoa(JSON.stringify(user))
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
                    const u = JSON.parse(atob(users[req.params.user]))
                    delete u.password
                    res.status(200).json(u)
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
                    const bad = this.validScopes ? unknownScopesIn(req.body?.resources ?? '', this.validScopes()) : []
                    if (bad.length) { res.status(400).json({ error: `Unknown scopes: ${bad.join(', ')}` }); return }
                    let password: string
                    if (req.body.password) {
                        password = await bcrypt.hash(req.body.password, 10)
                    }
                    else {
                        const existing = JSON.parse(atob(users[req.params.user] ?? users[req.body.id]))
                        password = existing.password
                    }
                    users[req.body.id] = btoa(JSON.stringify({ ...req.body, password }))
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
