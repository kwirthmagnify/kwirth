import express, { Request, Response } from 'express'
import * as crypto from 'crypto'
import { EAuthMethodKind, IAuthMethod, ILoginResponse } from '@kwirthmagnify/kwirth-common'
import { ISecrets } from '../tools/ISecrets'
import { IConfigMaps } from '../tools/IConfigMap'
import { ApiKeyApi } from './ApiKeyApi'
import { IdpManager } from '../tools/IdpManager'
import { IdentityService } from '../tools/auth/IdentityService'
import { TtlStore } from '../tools/auth/TtlStore'
import { ELogComponent, logError, logInfo, logWarning } from '../tools/Logging'

// contexto de la running instance activa (para leer usuarios y emitir AccessKey)
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

const STATE_TTL_MS = 10 * 60 * 1000
const HANDOFF_TTL_MS = 60 * 1000

/*
    Endpoints de autenticacion pre-login (montados en /core/auth/, exentos de validKey).
    Orquesta el flujo OIDC/OAuth2 delegando en los conectores (logica pura) del IdpManager,
    y emite el AccessKey via IdentityService. El conector nunca emite AccessKeys ni expone rutas.

    idpManager y el contexto activo se resuelven de forma LAZY porque este router se monta
    a nivel de app antes de que exista la running instance / el manager.
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

    constructor(getIdpManager: () => IdpManager | undefined, getContext: () => IAuthContext | undefined, envRootPath: string, legacyAuth: string) {
        this.getIdpManager = getIdpManager
        this.getContext = getContext
        this.envRootPath = envRootPath
        this.legacyAuth = legacyAuth
        this.includePasswordMethod = legacyAuth !== 'kubeconfig'
        this.initRoutes()
    }

    // valida la URL de retorno que aporta el front: solo se acepta si es localhost (dev) o mismo
    // origen que el back (prod). Evita open-redirect que filtraría el código de handoff (→ AccessKey).
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

    private static randomToken(): string {
        return crypto.randomBytes(32).toString('base64url')
    }

    private static pkceChallenge(verifier: string): string {
        return crypto.createHash('sha256').update(verifier).digest('base64url')
    }

    private initRoutes() {
        // metodos de autenticacion disponibles. 'auth' se mantiene por compatibilidad con el
        // front actual (lee auth.auth) hasta que consuma 'methods'.
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
                        methods.push({ id: inst.id, label: inst.label, kind: EAuthMethodKind.REDIRECT, startUrl: `/core/auth/${inst.id}/start` })
                    }
                }
                res.status(200).json({ auth: this.legacyAuth, methods })
            }
            catch (err) {
                logError(ELogComponent.AUTH, `Error building auth methods: ${err}`)
                res.status(500).json({ auth: this.legacyAuth, methods: [] })
            }
        })

        // inicio del flujo: redirige al IdP
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
                const redirectUri = `${this.baseUrl(req)}/core/auth/${instanceId}/callback`
                const url = await connector.buildAuthorizationUrl(inst.config, { redirectUri, state, codeChallenge })
                res.redirect(url)
            }
            catch (err) {
                logError(ELogComponent.AUTH, `Error starting auth for '${instanceId}': ${err}`)
                res.status(500).send('Error starting authentication')
            }
        })

        // callback del IdP: valida identidad, aplica el gate y emite el AccessKey
        this.router.get('/:instanceId/callback', async (req: Request, res: Response) => {
            const instanceId = req.params.instanceId
            // handoff final al SPA. Empieza como fallback (front servido por el back) y se actualiza
            // al returnTo aportado por el front (validado) una vez recuperado el state.
            let front = `${this.baseUrl(req)}/front`
            const fail = (reason: string) => res.redirect(`${front}${front.includes('?') ? '&' : '?'}ssoerror=${reason}`)

            const idpManager = this.getIdpManager()
            if (!idpManager) return fail('unavailable')

            const state = String(req.query.state || '')
            const code = String(req.query.code || '')

            const entry = this.stateStore.take(state)
            if (!entry || entry.instanceId !== instanceId) {
                logWarning(ELogComponent.AUTH, `Invalid/expired state on callback for '${instanceId}'`)
                return fail('state')
            }
            const allowedReturn = this.allowedReturnTo(entry.returnTo, req)
            if (allowedReturn) front = allowedReturn

            const inst = await idpManager.getInstance(instanceId)
            const connector = inst ? idpManager.getConnector(inst.connectorId) : undefined
            if (!inst || !connector) return fail('state')

            let identity
            try {
                const redirectUri = `${this.baseUrl(req)}/core/auth/${instanceId}/callback`
                // params crudos del callback (code, state, iss, ...) para que el conector cumpla RFC 9207
                const params: Record<string, string> = {}
                for (const [k, v] of Object.entries(req.query)) if (typeof v === 'string') params[k] = v
                identity = await connector.handleCallback(inst.config, { code, codeVerifier: entry.codeVerifier, redirectUri, params })
            }
            catch (err) {
                logError(ELogComponent.AUTH, `Callback exchange failed for '${instanceId}': ${err}`)
                return fail('callback')
            }

            if (!identity.emailVerified) {
                logWarning(ELogComponent.AUTH, `Unverified email from '${instanceId}': ${identity.email}`)
                return fail('unverified')
            }

            const ctx = this.getContext()
            if (!ctx) {
                logError(ELogComponent.AUTH, 'No active instance available on callback')
                return fail('unavailable')
            }

            const users = await IdentityService.readUsers(ctx.secrets)
            const user = users ? IdentityService.findUser(users, identity.email) : undefined
            if (!user) {
                logWarning(ELogComponent.AUTH, `IdP user not in whitelist: ${identity.email}`)
                return fail('notfound')
            }
            if (user.idp !== instanceId) {
                logWarning(ELogComponent.AUTH, `IdP mismatch for ${identity.email}: bound to '${user.idp}', used '${instanceId}'`)
                return fail('idpmismatch')
            }

            const ip = (req as any).clientIp || req.headers['x-forwarded-for'] || req.socket.remoteAddress
            const apiKey = await IdentityService.createApiKey(user, String(ip), ctx.configMaps, ctx.apiKeyApi)
            if (!apiKey) return fail('issue')
            user.accessKey = apiKey.accessKey

            const handoffCode = AuthApi.randomToken()
            this.handoffStore.put(handoffCode, IdentityService.okResponse(user))
            logInfo(ELogComponent.AUTH, `IdP login OK: ${identity.email} via '${instanceId}'`)
            res.redirect(`${front}${front.includes('?') ? '&' : '?'}sso=${handoffCode}`)
        })

        // el front canjea el codigo de handoff por el ILoginResponse
        this.router.post('/exchange', (req: Request, res: Response) => {
            const code = String(req.body?.code || '')
            const response = this.handoffStore.take(code)
            if (!response) {
                res.status(404).json({})
                return
            }
            res.status(200).json(response)
        })
    }
}

export { IAuthContext }
