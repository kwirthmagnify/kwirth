import express, { Request, Response } from 'express'
import * as crypto from 'crypto'
import { EAuthMethodKind, ESignupStatus, ESsoResult, IAuthMethod, ILoginResponse, ISignupInfo, ISignupReply, ISignupRequest, ISignupSubmit } from '@kwirthmagnify/kwirth-common'
import { ISecrets } from '../tools/ISecrets'
import { IConfigMaps } from '../tools/IConfigMap'
import { ApiKeyApi } from './ApiKeyApi'
import { IdpManager } from '../tools/IdpManager'
import { IdentityService } from '../tools/auth/IdentityService'
import { TtlStore } from '../tools/auth/TtlStore'
import { SIGNUP_PENDING_CAP, SignupStore } from '../tools/auth/SignupStore'
import { guard } from '../tools/RequestGuard'
import { ELogComponent, logError, logInfo, logWarning } from '../tools/Logging'

// the active running instance's context (for reading users and issuing an AccessKey)
interface IAuthContext {
    secrets: ISecrets
    configMaps: IConfigMaps
    apiKeyApi: ApiKeyApi
}

interface IStateEntry {
    instanceId: string
    codeVerifier: string
    returnTo?: string   // URL del front a la que devolver el handoff (la aporta el front, validada)
}

// what a signup code stands for: the identity the IdP verified, so the submit cannot name another email
interface ISignupHandoff {
    email: string
    name: string
    idp: string
}

const STATE_TTL_MS = 10 * 60 * 1000
const HANDOFF_TTL_MS = 60 * 1000
const SIGNUP_NAME_MAX = 100
const SIGNUP_COMMENT_MAX = 500

/*
    Pre-login authentication endpoints (mounted at /core/auth/, exempt from validKey).
    It orchestrates the OIDC/OAuth2 flow delegating to the IdpManager's connectors (pure logic),
    and issues the AccessKey through IdentityService. A connector never issues AccessKeys nor exposes routes.

    idpManager and the active context are resolved LAZILY because this router is mounted at app
    level before the running instance / the manager exists.
*/
export class AuthApi {
    public router = express.Router()
    private getIdpManager: () => IdpManager | undefined
    private getContext: () => IAuthContext | undefined
    private envRootPath: string
    private legacyAuth: string
    private includePasswordMethod: boolean
    private stateStore = new TtlStore<IStateEntry>(STATE_TTL_MS)
    private handoffStore = new TtlStore<ILoginResponse>(HANDOFF_TTL_MS)
    private signupCodes = new TtlStore<ISignupHandoff>(HANDOFF_TTL_MS)

    constructor(getIdpManager: () => IdpManager | undefined, getContext: () => IAuthContext | undefined, envRootPath: string, legacyAuth: string) {
        this.getIdpManager = getIdpManager
        this.getContext = getContext
        this.envRootPath = envRootPath
        this.legacyAuth = legacyAuth
        this.includePasswordMethod = legacyAuth !== 'kubeconfig'
        this.initRoutes()
    }

    // validates the return URL the front end supplies: it is accepted only when it is localhost (dev) or
    // the same origin as the back end (prod). It prevents an open redirect that would leak the handoff
    // code (→ AccessKey).
    private allowedReturnTo(returnTo: string | undefined, req: Request): string | undefined {
        if (!returnTo) return undefined
        try {
            const u = new URL(returnTo)
            if (['localhost', '127.0.0.1', '::1'].includes(u.hostname)) return returnTo
            const backProto = (req.headers['x-forwarded-proto'] as string) || req.protocol
            const backHost = (req.headers['x-forwarded-host'] as string) || req.get('host') || ''
            if (u.host === backHost && u.protocol === `${backProto}:`) return returnTo
        }
        catch (err) { /* URL inválida */ }
        return undefined
    }

    private baseUrl(req: Request): string {
        const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol
        const host = (req.headers['x-forwarded-host'] as string) || req.get('host')
        return `${proto}://${host}${this.envRootPath}`
    }

    /*
        The DEFAULT redirect_uri, derived from the request. It is only a default: an instance that pins
        'redirectUri' in its configuration overrides it, and that override is resolved where every other
        configured field is resolved — the shared OIDC/OAuth2 helpers in common-back, next to 'issuer'
        and 'scopes'. Here the core does the same job it does for those: supply the fallback.

        It cannot be more than a default. Inside the pod the connection is plain HTTP, so without
        'X-Forwarded-Proto' the scheme comes out as 'http' even though the browser spoke HTTPS, and the
        provider answers 'invalid redirect uri'. That is the reason the configurable field exists.
    */
    private defaultRedirectUri(instanceId: string, req: Request): string {
        return `${this.baseUrl(req)}/core/auth/${instanceId}/callback`
    }

    private static randomToken(): string {
        return crypto.randomBytes(32).toString('base64url')
    }

    private static pkceChallenge(verifier: string): string {
        return crypto.createHash('sha256').update(verifier).digest('base64url')
    }

    private initRoutes() {
        // the available authentication methods. 'auth' is kept for compatibility with the current front
        // end (it reads auth.auth) until it consumes 'methods'.
        this.router.get('/method', async (_req: Request, res: Response) => {
            try {
                const methods: IAuthMethod[] = []
                if (this.includePasswordMethod) {
                    methods.push({ id: 'kwirth', label: 'User & password', kind: EAuthMethodKind.PASSWORD })
                }
                const idpManager = this.getIdpManager()
                if (idpManager) {
                    const instances = await idpManager.getEnabledInstances()
                    for (const inst of instances) {
                        // do not offer a method whose connector is not loaded (uninstalled, removed from
                        // dev, or a failure on loading): the login would show it and pressing it would
                        // give 'connector not available'
                        if (!idpManager.getConnector(inst.connectorId)) {
                            logWarning(ELogComponent.AUTH, `Skipping login method '${inst.id}': connector '${inst.connectorId}' not available`)
                            continue
                        }
                        methods.push({ id: inst.id, label: inst.label, kind: EAuthMethodKind.REDIRECT, startUrl: `/core/auth/${inst.id}/start` })
                    }
                }
                /*
                    'startChannel': the channel to open a tab of right after login, if it is installed.
                    Whoever launches Kwirth names it (the desktop launchers set KWIRTH_START_CHANNEL); the
                    core only passes it on. It travels here, with what the login screen needs, because it
                    is THIS Kwirth's choice — the desktop's — even when the user goes on to a remote one.
                */
                res.status(200).json({ auth: this.legacyAuth, methods, startChannel: process.env.KWIRTH_START_CHANNEL || undefined })
            }
            catch (err) {
                logError(ELogComponent.AUTH, `Error building auth methods: ${err}`)
                res.status(500).json({ auth: this.legacyAuth, methods: [] })
            }
        })

        // the flow's start: it redirects to the IdP
        this.router.get('/:instanceId/start', async (req: Request, res: Response) => {
            const idpManager = this.getIdpManager()
            if (!idpManager) {
                res.status(503).send('Identity providers not ready')
                return
            }
            const instanceId = req.params.instanceId
            const inst = await idpManager.getInstance(instanceId)
            if (!inst || !inst.enabled) {
                res.status(404).send('Unknown or disabled identity provider')
                return
            }
            const connector = idpManager.getConnector(inst.connectorId)
            if (!connector) {
                logError(ELogComponent.AUTH, `Connector '${inst.connectorId}' not available for instance '${instanceId}'`)
                res.status(500).send('Identity provider connector not available')
                return
            }
            try {
                const state = AuthApi.randomToken()
                const codeVerifier = AuthApi.randomToken()
                const codeChallenge = AuthApi.pkceChallenge(codeVerifier)
                const returnTo = this.allowedReturnTo(typeof req.query.returnTo === 'string' ? req.query.returnTo : undefined, req)
                this.stateStore.put(state, { instanceId, codeVerifier, returnTo })
                const redirectUri = this.defaultRedirectUri(instanceId, req)
                const url = await connector.buildAuthorizationUrl(inst.config, { redirectUri, state, codeChallenge })
                res.redirect(url)
            }
            catch (err) {
                logError(ELogComponent.AUTH, `Error starting auth for '${instanceId}': ${err}`)
                res.status(500).send('Error starting authentication')
            }
        })

        // the IdP's callback: it validates the identity, applies the gate and issues the AccessKey
        this.router.get('/:instanceId/callback', async (req: Request, res: Response) => {
            const instanceId = req.params.instanceId
            // the final handoff to the SPA. It starts as a fallback (the front end served by the back
            // end) and is updated to the returnTo the front end supplied (validated) once the state has
            // been recovered.
            let front = `${this.baseUrl(req)}/front`
            const fail = (reason: ESsoResult) => res.redirect(`${front}${front.includes('?') ? '&' : '?'}ssoerror=${reason}`)

            const idpManager = this.getIdpManager()
            if (!idpManager) return fail(ESsoResult.UNAVAILABLE)

            const state = String(req.query.state || '')
            const code = String(req.query.code || '')

            const entry = this.stateStore.take(state)
            if (!entry || entry.instanceId !== instanceId) {
                logWarning(ELogComponent.AUTH, `Invalid/expired state on callback for '${instanceId}'`)
                return fail(ESsoResult.STATE)
            }
            const allowedReturn = this.allowedReturnTo(entry.returnTo, req)
            if (allowedReturn) front = allowedReturn

            const inst = await idpManager.getInstance(instanceId)
            const connector = inst ? idpManager.getConnector(inst.connectorId) : undefined
            if (!inst || !connector) return fail(ESsoResult.STATE)

            let identity
            try {
                const redirectUri = this.defaultRedirectUri(instanceId, req)
                // the callback's raw params (code, state, iss, ...) so that the connector complies with RFC 9207
                const params: Record<string, string> = {}
                for (const [k, v] of Object.entries(req.query)) if (typeof v === 'string') params[k] = v
                identity = await connector.handleCallback(inst.config, { code, codeVerifier: entry.codeVerifier, redirectUri, params })
            }
            catch (err) {
                logError(ELogComponent.AUTH, `Callback exchange failed for '${instanceId}': ${err}`)
                return fail(ESsoResult.CALLBACK)
            }

            if (!identity.emailVerified) {
                logWarning(ELogComponent.AUTH, `Unverified email from '${instanceId}': ${identity.email}`)
                return fail(ESsoResult.UNVERIFIED)
            }

            const ctx = this.getContext()
            if (!ctx) {
                logError(ELogComponent.AUTH, 'No active instance available on callback')
                return fail(ESsoResult.UNAVAILABLE)
            }

            const users = await IdentityService.readUsers(ctx.secrets)
            const user = users ? IdentityService.findUser(users, identity.email) : undefined
            if (!user) {
                /*
                    Not a user. If this IdP lets them ask for access, say where their request stands, or
                    hand them a code to ask with. Otherwise, the whitelist as it has always been.
                */
                if (!SignupStore.allows(inst.signup, identity.email)) {
                    logWarning(ELogComponent.AUTH, `IdP user not in whitelist: ${identity.email}`)
                    return fail(ESsoResult.NOTFOUND)
                }
                const existing = await SignupStore.get(ctx.secrets, identity.email)
                if (existing?.status === ESignupStatus.PENDING) return fail(ESsoResult.PENDING)
                if (existing?.status === ESignupStatus.REJECTED) return fail(ESsoResult.REJECTED)
                if (await SignupStore.isFull(ctx.secrets, instanceId)) {
                    logWarning(ELogComponent.AUTH, `Signup refused for ${identity.email}: '${instanceId}' already has ${SIGNUP_PENDING_CAP} pending requests`)
                    return fail(ESsoResult.SIGNUPLIMIT)
                }
                const signupCode = AuthApi.randomToken()
                this.signupCodes.put(signupCode, { email: identity.email, name: identity.name ?? '', idp: instanceId })
                logInfo(ELogComponent.AUTH, `IdP user not in whitelist, offered signup: ${identity.email} via '${instanceId}'`)
                return res.redirect(`${front}${front.includes('?') ? '&' : '?'}signup=${signupCode}`)
            }
            if (user.idp !== instanceId) {
                logWarning(ELogComponent.AUTH, `IdP mismatch for ${identity.email}: bound to '${user.idp}', used '${instanceId}'`)
                return fail(ESsoResult.IDPMISMATCH)
            }

            const ip = (req as any).clientIp || req.headers['x-forwarded-for'] || req.socket.remoteAddress
            const apiKey = await IdentityService.createApiKey(user, String(ip), ctx.configMaps, ctx.apiKeyApi)
            if (!apiKey) return fail(ESsoResult.ISSUE)
            user.accessKey = apiKey.accessKey

            const handoffCode = AuthApi.randomToken()
            this.handoffStore.put(handoffCode, IdentityService.okResponse(user))
            logInfo(ELogComponent.AUTH, `IdP login OK: ${identity.email} via '${instanceId}'`)
            res.redirect(`${front}${front.includes('?') ? '&' : '?'}sso=${handoffCode}`)
        })

        // the front end exchanges the handoff code for the ILoginResponse
        this.router.post('/exchange', (req: Request, res: Response) => {
            const code = String(req.body?.code || '')
            const response = this.handoffStore.take(code)
            if (!response) {
                res.status(404).json({})
                return
            }
            res.status(200).json(response)
        })

        // what the signup dialog shows. It does NOT spend the code: the submit does.
        this.router.post('/signup/info', async (req: Request, res: Response) => {
            const entry = this.signupCodes.peek(String(req.body?.code || ''))
            if (!entry) {
                res.status(404).json({})
                return
            }
            const inst = await this.getIdpManager()?.getInstance(entry.idp)
            const info: ISignupInfo = { id: entry.email, name: entry.name, idp: entry.idp, idpLabel: inst?.label ?? entry.idp }
            res.status(200).json(info)
        })

        /*
            The signup request itself. The code is spent first, whatever happens next: a code is good for one
            try. Everything the callback checked is checked AGAIN inside the identity lock, because up to a
            minute has gone by and two submits may race for the last place under the cap.
        */
        this.router.post('/signup', async (req: Request, res: Response) => {
            const body = (req.body ?? {}) as Partial<ISignupSubmit>
            const entry = this.signupCodes.take(String(body.code || ''))
            if (!entry) {
                res.status(404).json({})
                return
            }
            const name = typeof body.name === 'string' ? body.name.trim() : ''
            const comment = typeof body.comment === 'string' ? body.comment.trim() : ''
            if (name === '' || name.length > SIGNUP_NAME_MAX || comment.length > SIGNUP_COMMENT_MAX) {
                res.status(400).json({})
                return
            }
            const ctx = this.getContext()
            const idpManager = this.getIdpManager()
            if (!ctx || !idpManager) {
                res.status(503).json({})
                return
            }
            const refuse = (result?: ESsoResult) => {
                const reply: ISignupReply = { result }
                res.status(409).json(reply)
            }
            guard(IdentityService.lock.use(async () => {
                // the admin may have switched signup off, or narrowed the domains, since the callback
                const inst = await idpManager.getInstance(entry.idp)
                if (!inst?.enabled || !SignupStore.allows(inst.signup, entry.email)) return refuse(ESsoResult.NOTFOUND)
                const users = await IdentityService.readUsers(ctx.secrets)
                if (users && IdentityService.findUser(users, entry.email)) return refuse()
                const existing = await SignupStore.get(ctx.secrets, entry.email)
                if (existing?.status === ESignupStatus.PENDING) return refuse(ESsoResult.PENDING)
                if (existing?.status === ESignupStatus.REJECTED) return refuse(ESsoResult.REJECTED)
                if (await SignupStore.isFull(ctx.secrets, entry.idp)) return refuse(ESsoResult.SIGNUPLIMIT)
                const request: ISignupRequest = {
                    id: entry.email,
                    idp: entry.idp,
                    name,
                    comment: comment || undefined,
                    requestedAt: Date.now(),
                    status: ESignupStatus.PENDING
                }
                await SignupStore.save(ctx.secrets, request)
                logInfo(ELogComponent.AUTH, `Signup request from ${entry.email} via '${entry.idp}'`)
                res.status(200).json({})
            }), res, ELogComponent.AUTH)
        })
    }
}

export { IAuthContext }
