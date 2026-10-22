import express, { Request, Response } from 'express'
import { AccessKey, ESignupStatus, ISignupApproval, IUser } from '@kwirthmagnify/kwirth-common'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'
import { ApiKeyApi } from './ApiKeyApi'
import { ISecrets } from '../tools/ISecrets'
import { IdentityService } from '../tools/auth/IdentityService'
import { SignupStore } from '../tools/auth/SignupStore'
import { unknownScopesIn } from '../tools/ScopeCatalog'
import { guard } from '../tools/RequestGuard'
import { ELogComponent, logInfo } from '../tools/Logging'

/*
    The admin's side of signup (plan: plans/signup, S2): see the requests, approve, reject, delete.
    Admin-only, like UserApi. It is not under /user because '/user/:user' would take '/user/signups' for a
    user called 'signups'.

    Every handler holds IdentityService.lock: approving writes 'kwirth-users' AND 'kwirth-signups', and the
    others must not interleave with it.
*/
export class SignupApi {
    public router = express.Router()

    constructor (secrets: ISecrets, apiKeyApi: ApiKeyApi, validScopes?: () => Set<string>) {
        this.router.use(async (req: Request, res: Response, next) => {
            if (! (await AuthorizationManagement.validKey(req, res, apiKeyApi))) return
            if (!AuthorizationManagement.hasScope(req, 'admin')) { res.status(403).json({ error: 'admin scope required' }); return }
            next()
        })

        this.router.get('/', async (_req: Request, res: Response) => {
            guard(IdentityService.lock.use(async () => {
                const all = await SignupStore.list(secrets)
                all.sort((a, b) => b.requestedAt - a.requestedAt)
                res.status(200).json(all)
            }), res, ELogComponent.AUTH)
        })

        /*
            Approving turns the request into a user bound to the IdP it came through, and removes it. The
            user is written FIRST: if removing the request then failed, the person can already log in and
            the leftover request is harmless; the other order could lose both.
        */
        this.router.post('/:id/approve', async (req: Request, res: Response) => {
            guard(IdentityService.lock.use(async () => {
                const request = await SignupStore.get(secrets, req.params.id)
                if (!request) { res.status(404).json({}); return }
                const body = (req.body ?? {}) as Partial<ISignupApproval>
                if (typeof body.resources !== 'string') { res.status(400).json({ error: 'resources required' }); return }
                const bad = validScopes ? unknownScopesIn(body.resources, validScopes()) : []
                if (bad.length) { res.status(400).json({ error: `Unknown scopes: ${bad.join(', ')}` }); return }

                const users = await IdentityService.readUsers(secrets)
                if (!users) { res.status(500).json({}); return }
                if (IdentityService.findUser(users, request.id)) { res.status(409).json({ error: 'user already exists' }); return }

                // no password: an IdP-bound user can never use one (LoginApi refuses them, S0)
                const user: IUser = {
                    id: request.id,
                    name: request.name,
                    password: '',
                    accessKey: new AccessKey(),
                    resources: body.resources,
                    idp: request.idp,
                    startChannel: body.startChannel || undefined,
                    exitFullScreen: body.exitFullScreen,
                    enabledChannels: body.enabledChannels?.length ? body.enabledChannels : undefined
                }
                users[user.id] = btoa(JSON.stringify(user))
                await IdentityService.writeUsers(secrets, users)
                await SignupStore.remove(secrets, request.id)
                logInfo(ELogComponent.AUTH, `Signup approved: ${request.id} via '${request.idp}'`)
                res.status(200).json({})
            }), res, ELogComponent.AUTH)
        })

        this.router.post('/:id/reject', async (req: Request, res: Response) => {
            guard(IdentityService.lock.use(async () => {
                const request = await SignupStore.get(secrets, req.params.id)
                if (!request) { res.status(404).json({}); return }
                await SignupStore.save(secrets, { ...request, status: ESignupStatus.REJECTED })
                logInfo(ELogComponent.AUTH, `Signup rejected: ${request.id} via '${request.idp}'`)
                res.status(200).json({})
            }), res, ELogComponent.AUTH)
        })

        // deleting a request (pending or rejected) lets that person ask again
        this.router.delete('/:id', async (req: Request, res: Response) => {
            guard(IdentityService.lock.use(async () => {
                const request = await SignupStore.get(secrets, req.params.id)
                if (!request) { res.status(404).json({}); return }
                await SignupStore.remove(secrets, request.id)
                logInfo(ELogComponent.AUTH, `Signup request deleted: ${request.id}`)
                res.status(200).json({})
            }), res, ELogComponent.AUTH)
        })
    }
}
