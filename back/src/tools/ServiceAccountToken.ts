import { AuthenticationV1TokenRequest, CoreV1Api } from '@kubernetes/client-node'
import fs from 'fs'
import { ELogComponent, logError, logInfo, logWarning } from './Logging'

/*
    Where the token to talk to the kubelet comes from.

    Kubernetes already puts a ServiceAccount token inside every pod, at a well known path, and the
    KUBELET ROTATES IT. Asking the API server for one instead, with a TokenRequest, costs a 'create'
    on serviceaccounts/token —a write, in a deployment that may be meant to have none— and hands back
    a string that expires. Kwirth asked for one once, at boot, with a week of life, and nobody ever
    renewed it: seven days after every start the kubelet began answering 401 and the metrics stopped,
    in silence, until someone restarted the pod.

    So the projected file is the source of truth whenever it is there, and it is RE-READ rather than
    remembered. The TokenRequest stays as the fallback for a pod mounted with
    automountServiceAccountToken set to false, where there is no file to read.
*/
export class ServiceAccountToken {
    static readonly PROJECTED_TOKEN_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/token'

    /*
        The file is on a tmpfs, but 'current' is read on every scrape of every node, so a short cache
        keeps it to one read a minute. The kubelet refreshes the projection long before the token
        expires, so a minute of staleness can never hand out a dead one.
    */
    private static readonly CACHE_MS = 60 * 1000

    coreApi: CoreV1Api
    namespace: string

    // what the TokenRequest gave us, used only when there is no projected file
    private requestedToken: string|undefined
    private cached: { value: string, readAt: number }|undefined
    private projectedTokenPath: string
    private cacheMs: number

    /*
        The path and the cache window are parameters and not constants so that a test can point them
        somewhere real. Nothing in the product passes them.
    */
    constructor (coreApi: CoreV1Api, namespace:string, projectedTokenPath: string = ServiceAccountToken.PROJECTED_TOKEN_PATH, cacheMs: number = ServiceAccountToken.CACHE_MS) {
        this.coreApi = coreApi
        this.namespace = namespace
        this.projectedTokenPath = projectedTokenPath
        this.cacheMs = cacheMs
    }

    private readProjectedToken = (): string|undefined => {
        try {
            const value = fs.readFileSync(this.projectedTokenPath, 'utf8').trim()
            return value === '' ? undefined : value
        }
        catch {
            // no file is a normal answer here: outside a cluster, or with the automount turned off
            return undefined
        }
    }

    /*
        What every caller must use, and the reason ClusterInfo.token is a getter: the value is read
        again, so holding on to one is impossible by construction.
    */
    get current(): string|undefined {
        const now = Date.now()
        if (this.cached && now - this.cached.readAt < this.cacheMs) return this.cached.value

        const projected = this.readProjectedToken()
        if (projected) {
            this.cached = { value: projected, readAt: now }
            return projected
        }
        return this.requestedToken
    }

    /*
        Called once at startup, to decide where the token comes from and to SAY SO. Without that line
        in the log, "metrics work" and "metrics will stop in a week" look exactly alike.
    */
    obtain = async (serviceAccountName: string, namespace: string): Promise<string|undefined> => {
        const projected = this.readProjectedToken()
        if (projected) {
            this.cached = { value: projected, readAt: Date.now() }
            logInfo(ELogComponent.CORE, `Using the projected ServiceAccount token at '${this.projectedTokenPath}', which the kubelet renews`)
            return projected
        }

        logWarning(ELogComponent.CORE, `No projected token at '${this.projectedTokenPath}' (automountServiceAccountToken off?). Falling back to a TokenRequest, which expires and will NOT be renewed`)
        this.requestedToken = await this.createToken(serviceAccountName, namespace)
        return this.requestedToken
    }

    createToken = async (serviceAccountName: string, namespace: string) => {
        try {
            const tokenRequest: AuthenticationV1TokenRequest = {
                spec: {
                    //audiences: ["https://kubernetes.default.svc"],
                    audiences: [],
                    expirationSeconds: 3600 * 24 * 7
                }
            }

            const response = await this.coreApi.createNamespacedServiceAccountToken({ name: serviceAccountName, namespace, body: tokenRequest })
            const token = response.status?.token
            logInfo(ELogComponent.CORE, `Token created for '${serviceAccountName}'`)
            return token
        }
        catch (err: any) {
            logError(ELogComponent.CORE, 'Error creating SA token:')
            logError(ELogComponent.CORE, err)
        }
    }


    public deleteToken = async (serviceAccountName: string, namespace: string) => {
        try {
            const response = await this.coreApi.deleteNamespacedSecret({ name:serviceAccountName+'-kwirthtoken', namespace })
            logInfo(ELogComponent.CORE, 'SA token deleted')
        }
        catch (err) {
            logError(ELogComponent.CORE, 'Error deleting SA token')
            logError(ELogComponent.CORE, err)
        }
    }

}
