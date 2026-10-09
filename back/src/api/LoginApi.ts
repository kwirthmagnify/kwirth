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
import { LoginRateLimiter } from '../tools/LoginRateLimiter'
import { ELogComponent, logError, logWarning } from '../tools/Logging'

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex')

/*
    Verifies the incoming password against the stored one. Both are bcrypt, always.

    🔴 There used to be a second path here: a stored value in PLAIN TEXT, compared as sha256(stored),
    and re-hashed on the way out. It was there to migrate installations written before hashing, and it
    is gone — a code path that accepts an unhashed stored password is a code path that makes storing
    one work, and everything that seeds a user now writes bcrypt: the core's own bootstrap admin, the
    Helm chart, and UserApi when somebody is created from the UI.

    ⚠️ Deliberate break: an installation still holding a plain password cannot log in. Delete the
    'kwirth-users' Secret and let the core seed its admin again.

    What is compared is bcrypt against the SHA-256 the front end sends, never the clear text — the
    clear text never leaves the browser. So the stored value is bcrypt(sha256(password)), and anything
    that writes a user has to hash the same way.

    All three bcrypt prefixes are accepted. bcryptjs verifies $2a$, $2b$ and $2y$ alike, and insisting
    on $2b$ would reject hashes made by perfectly ordinary tools — Helm's htpasswd emits $2a$.
*/
const BCRYPT_PREFIXES = ['$2a$', '$2b$', '$2y$']
const isBcrypt = (value: string) => BCRYPT_PREFIXES.some(p => value.startsWith(p))

// the default the core seeds, as the front end would send it: what 'you are still on the default' means
const DEFAULT_PASSWORD_SHA = sha256('password')

const verifyPassword = async (incoming: string, stored: string, userId: string) => {
    if (!isBcrypt(stored)) {
        logWarning(ELogComponent.CORE, `User '${userId}' has a password that is not a bcrypt hash; login refused. Passwords in clear text are no longer accepted.`)
        return { valid: false, firstLogin: false }
    }
    const valid = await bcrypt.compare(incoming, stored)
    // still on the password the core seeds: the UI asks for a new one instead of letting them in
    const firstLogin = valid && userId === 'admin' && await bcrypt.compare(DEFAULT_PASSWORD_SHA, stored)
    return { valid, firstLogin }
}

export class LoginApi {
    secrets: ISecrets
    configMaps: IConfigMaps
    apiKeyApi: ApiKeyApi
    static semaphore:Semaphore = new Semaphore(1)
    static rateLimiter: LoginRateLimiter = new LoginRateLimiter()
    public router = express.Router()

    // Brute-force key: ip + user. Per-user so one noisy ip cannot lock every account out, and per-ip so a
    // single attacker cannot spread attempts across users to dodge the cap.
    private static rateKey(req:Request): string {
        const ip = (req as any).clientIp || req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''
        return `${ip}:${req.body?.user || ''}`
    }

    constructor (secrets: ISecrets, configMaps: IConfigMaps, apiKeyApi:ApiKeyApi) {
        this.secrets = secrets
        this.configMaps = configMaps
        this.apiKeyApi = apiKeyApi

        // authentication (login)
        this.router.post('/', async (req:Request,res:Response) => {
            guard(LoginApi.semaphore.use ( async () => {
                const rateKey = LoginApi.rateKey(req)
                const retryMs = LoginApi.rateLimiter.retryAfterMs(rateKey)
                if (retryMs > 0) {
                    logWarning(ELogComponent.CORE, `Login blocked by rate limit: ${rateKey} (retry in ${Math.ceil(retryMs/1000)}s)`)
                    res.setHeader('Retry-After', Math.ceil(retryMs / 1000))
                    res.status(429).json({})
                    return
                }

                let users = await IdentityService.readUsers(this.secrets)
                if (!users) {
                    logError(ELogComponent.CORE, 'Cannot access kwirth users on /')
                    res.status(401).json()
                    return
                }

                if (!users[req.body.user]) {
                    LoginApi.rateLimiter.fail(rateKey)
                    res.status(401).json()
                    return
                }
                let user:IUser = JSON.parse(atob(users[req.body.user]))
                if (user) {
                    const { valid, firstLogin } = await verifyPassword(req.body.password, user.password, user.id)
                    if (!valid) {
                        LoginApi.rateLimiter.fail(rateKey)
                        res.status(401).json({})
                        return
                    }
                    LoginApi.rateLimiter.success(rateKey)
                    if (firstLogin) {
                        res.status(201).send()
                        return
                    }
                    let ip = (req as any).clientIp || req.headers['x-forwarded-for'] || req.socket.remoteAddress
                    let newApiKey = await IdentityService.createApiKey(user, ip, this.configMaps, this.apiKeyApi)
                    if (newApiKey) {
                        user.accessKey = newApiKey.accessKey
                        res.status(200).json(IdentityService.okResponse(user))
                    }
                    else {
                        logError(ELogComponent.CORE, 'Error creating api key')
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
                const rateKey = LoginApi.rateKey(req)
                const retryMs = LoginApi.rateLimiter.retryAfterMs(rateKey)
                if (retryMs > 0) {
                    logWarning(ELogComponent.CORE, `Password change blocked by rate limit: ${rateKey} (retry in ${Math.ceil(retryMs/1000)}s)`)
                    res.setHeader('Retry-After', Math.ceil(retryMs / 1000))
                    res.status(429).send()
                    return
                }

                let users = await IdentityService.readUsers(this.secrets)
                if (!users) {
                    logError(ELogComponent.CORE, 'Cannot access kwirth users for changini password')
                    res.status(401).json()
                    return
                }

                if (!users[req.body.user]) {
                    LoginApi.rateLimiter.fail(rateKey)
                    res.status(401).json()
                    return
                }

                let user:IUser = JSON.parse (atob(users[req.body.user]))
                if (user) {
                    const { valid } = await verifyPassword(req.body.password, user.password, user.id)
                    if (!valid) {
                        LoginApi.rateLimiter.fail(rateKey)
                        res.status(401).send()
                        return
                    }
                    LoginApi.rateLimiter.success(rateKey)
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
                        logError(ELogComponent.CORE, 'Error creating api key')
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
