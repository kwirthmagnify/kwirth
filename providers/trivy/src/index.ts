import express, { Request, Response, NextFunction } from 'express'
import zlib from 'zlib'
import { IExtensionLogger, IProvider, IProviderSubscriber, createCrdInformer, ICrdInformerHandlers, applyAllResources, deleteAllResources, scopeAllows } from '@kwirthmagnify/kwirth-common-back'
import { accessKeyDeserialize } from '@kwirthmagnify/kwirth-common'
// @ts-ignore the build gzips it into a base64 string: 131 KB of YAML cannot be read from disk at runtime
import trivyOperatorYamlGz from './trivy-operator-0.30.1.yaml'
import { ITrivyAsset, ITrivySubscriptionData, ITrivyProviderEvent, ITrivyMeta, ITrivyMetaEvent, ETrivyEventKind, TRIVY_API_VERSION, TRIVY_API_GROUP, TRIVY_API_VULN_PLURAL, TRIVY_API_AUDIT_PLURAL, TRIVY_API_SBOM_PLURAL, TRIVY_API_EXPOSED_PLURAL, TRIVY_API_RBAC_PLURAL, TRIVY_API_CLUSTER_RBAC_PLURAL } from './TrivyTypes'

const ALL_PLURALS = [TRIVY_API_VULN_PLURAL, TRIVY_API_AUDIT_PLURAL, TRIVY_API_SBOM_PLURAL, TRIVY_API_EXPOSED_PLURAL, TRIVY_API_RBAC_PLURAL, TRIVY_API_CLUSTER_RBAC_PLURAL]

// Where the Trivy version lives in the cluster (a standard trivy-operator installation).
const TRIVY_NS = 'trivy-system'
const TRIVY_CONFIGMAP = 'trivy-operator-trivy-config'
const TRIVY_OPERATOR_DEPLOY = 'trivy-operator'


export class TrivyProvider implements IProvider {
    public readonly id = 'trivy'
    /*
        Starts writing to the console — what it did before — and the core replaces it as soon as the
        provider is built. Note the console prefix said '[trivy-provider]', which is NOT the provider
        id: the core writes '[trivy]', the real one.
    */
    private log: IExtensionLogger = {
        info: (message: unknown) => console.log(`[trivy] ${message}`),
        trace: (message: unknown) => console.log(`[trivy] ${message}`),
        warning: (message: unknown) => console.warn(`[trivy] ${message}`),
        error: (message: unknown) => console.error(`[trivy] ${message}`)
    }
    setLogger = (logger: IExtensionLogger): void => { this.log = logger }
    public readonly providesRouter = false
    public router = undefined
    public routerAlias = undefined
    public readonly requiresApiKeyApi = false
    public apiKeyApi = undefined

    private subscribers: Map<IProviderSubscriber, ITrivySubscriptionData> = new Map()

    /*
        What this provider knows about itself: how many consumers it has RIGHT NOW. The contract
        (IProvider.getStats, optional since kwirth-common-back 0.5.50) asks for it to be CHEAP — what is
        already held is returned, nothing is computed — and it is what lets kwirth say whether this is
        being consumed or emitting for nobody.
    */
    /*
        Deliveries since startup: informers, the initial sync and the sending of meta. One per call to a
        subscriber, not one per object produced — this provider filters by reportTypes.
    */
    private deliveries = 0

    getStats = () => ({ subscribers: this.subscribers.size, events: this.deliveries })

    private informers: Map<string, any> = new Map()
    private clusterInfo: any

    /*
        Managing the Trivy Operator — installing it, removing it, saying whether it is there.

        🔴 It lives HERE and not in the trivy plugin, where it was until `provider/trivy@0.4.0`. The
        operator is what writes the CRDs this provider reads: it is this extension's business, not the
        channel's. The channel's job is to paint reports that already exist, and it should not stop
        working — or stop being installable — because of who deploys the operator.

        It is `configRouter` and NOT `router`: the core mounts configRouter at
        '/core/providerconfig/trivy' ALWAYS behind accessKey validation, which it puts there itself,
        while `router` is public and takes external traffic that carries no Kwirth key. Mounting this on
        the public one would hand the cluster to anybody who can reach the port.

        ⚠️ Side effect, and it is the one we want: having a configRouter makes the core INSTANTIATE this
        provider at start-up even when no channel has asked for it yet. Without that, the gear would
        open on a provider that does not exist until somebody opens the Trivy tab.
    */
    public configRouter = express.Router()

    constructor(clusterInfo: any, _kwirthData: unknown) {
        this.clusterInfo = clusterInfo
        this.buildConfigRouter()
    }

    /*
        🔴 ADMIN, and the core does not check it for us.

        What the core puts in front of configRouter is `validKey`, which is AUTHENTICATION: it proves the
        caller holds a valid Kwirth key, not that the key may do this. The providers manager is an
        admin-only screen, but a screen is not a door — these routes answer to curl with any valid key.
        And what is behind them applies or DELETES a deployment, its CRDs and its RBAC across the whole
        cluster.

        This is the same hole that `trivy-endpoint-auth` closed in the plugin on 2026-10-17, and moving
        the feature is no reason to reopen it. It is the ONLY permission check that survived the move:
        everything else the plugin carried for this went away with the button.
    */
    private isAdmin = (req: Request): boolean => {
        const header = req.headers['authorization']
        const bearer = typeof header === 'string' && header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
        if (!bearer) return false
        try {
            const key = accessKeyDeserialize(bearer)
            // 'admin' is the top of any ladder; a flat one is enough to ask just this question
            return scopeAllows(key.resources, 'admin', (scope: string) => ['', 'admin'].indexOf(scope))
        }
        catch {
            // A key that cannot be read authorises nothing, and an exception from an async handler would
            // escape as an unhandledRejection and take the core down with it.
            return false
        }
    }

    private buildConfigRouter = (): void => {
        this.configRouter.use((req: Request, res: Response, next: NextFunction) => {
            if (!this.isAdmin(req)) {
                this.log.warning(`Denied '${req.path}' on the Trivy operator: 'admin' required`)
                res.status(403).send("'admin' scope required")
                return
            }
            next()
        })

        this.configRouter.get('/status', async (_req: Request, res: Response) => {
            try {
                const cm = await this.clusterInfo.coreApi?.readNamespacedConfigMap({ name: TRIVY_CONFIGMAP, namespace: TRIVY_NS })
                if (!cm?.data) res.status(200).json({ installed: false, detail: `No Trivy config map in namespace '${TRIVY_NS}'` })
                else res.status(200).json({ installed: true, detail: `Installed [${cm.data['trivy.command']}, 0.30.1]` })
            }
            catch {
                // Not an error: the configMap missing is exactly how 'not installed' looks
                res.status(200).json({ installed: false, detail: `Not installed (no Trivy configMap in '${TRIVY_NS}')` })
            }
        })

        this.configRouter.post('/install', async (_req: Request, res: Response) => {
            try {
                await applyAllResources(this.operatorYaml(), this.clusterInfo)
                this.log.info('Trivy Operator installed')
                res.status(200).json({ ok: true })
            }
            catch (err) {
                this.log.error(`Installing the Trivy Operator failed: ${err}`)
                res.status(500).json({ ok: false, error: String(err) })
            }
        })

        this.configRouter.post('/remove', async (_req: Request, res: Response) => {
            try {
                await deleteAllResources(this.operatorYaml(), this.clusterInfo)
                this.log.info('Trivy Operator removed')
                res.status(200).json({ ok: true })
            }
            catch (err) {
                this.log.error(`Removing the Trivy Operator failed: ${err}`)
                res.status(500).json({ ok: false, error: String(err) })
            }
        })
    }

    /** Unpacked on use and not at import time: 131 KB of YAML that most runs never need. */
    private operatorYaml = (): string => zlib.gunzipSync(Buffer.from(trivyOperatorYamlGz as unknown as string, 'base64')).toString('utf-8')

    addSubscriber = async (c: IProviderSubscriber, data: ITrivySubscriptionData) => {
        /*
            It is normalised by LOOKING AT reportTypes, and not with `data ?? ...`: a subscriber that
            asks for no particular types sends an EMPTY object, which is not nullish, so the default value
            did not kick in and reportTypes was left undefined. What came next was a `for...of undefined`
            inside a promise nobody awaited: an unhandled rejection and the whole core down. provider-debug
            gave it away, since it subscribes with no payload.
        */
        const reportTypes = Array.isArray(data?.reportTypes) && data.reportTypes.length > 0 ? data.reportTypes : ALL_PLURALS
        const subData: ITrivySubscriptionData = { ...data, reportTypes }
        this.subscribers.set(c, subData)
        this.log.info(`subscriber added, total: ${this.subscribers.size}`)
        // RC-1: initial state sync. The provider is shared and its informers may
        // already have delivered their initial LIST to other subscribers; one that
        // arrives late would be left with no state. So on every registration we list
        // the current CRDs and dispatch them ONLY to this subscriber. Done in parallel
        // (no await) so registration is not blocked.
        //
        // ⛔ A fire-and-forget ALWAYS carries its catch: nobody is awaiting this promise, so a failure
        // does not stay inside this provider — it becomes an unhandled rejection and the core exits.
        this.sendInitialState(c, reportTypes)
            .catch(err => this.log.error(`initial-state sync failed: ${err}`))
        // We also deliver the cluster's Trivy version to this subscriber. It is read
        // on every registration (subscriptions are infrequent) rather than watching the
        // configmap: the version changes once or twice a year, and drift shows up when
        // comparing what arrives with what the consumer has stored.
        this.sendTrivyMeta(c)
            .catch(err => this.log.error(`trivy meta delivery failed: ${err}`))
    }

    removeSubscriber = async (c: IProviderSubscriber) => {
        this.subscribers.delete(c)
        this.log.info(`subscriber removed, total: ${this.subscribers.size}`)
    }

    updateSubscription = async (c: IProviderSubscriber, data: ITrivySubscriptionData) => {
        if (this.subscribers.has(c)) {
            this.subscribers.set(c, data)
            this.log.info(`subscription updated, reportTypes: ${data.reportTypes.join(',')}`)
        }
    }

    startProvider = async () => {
        this.log.info('starting — creating informers for all CRD types')
        for (const plural of ALL_PLURALS) {
            const informer = this.createInformer(plural)
            this.informers.set(plural, informer)
            informer.start()
        }
    }

    stopProvider = async () => {
        this.log.info('stopping informers')
        for (const informer of this.informers.values()) {
            try { informer.stop() } catch {}
        }
        this.informers.clear()
    }

    getReportsForAsset = async (namespace: string, podName: string, containerName: string, reportTypes: string[]): Promise<ITrivyProviderEvent[]> => {
        const asset: ITrivyAsset = { namespace, podName, containerName }
        const results: ITrivyProviderEvent[] = []
        for (const plural of reportTypes) {
            const withContainer = plural !== TRIVY_API_AUDIT_PLURAL
            const report = await this.getReport(plural, asset, withContainer)
            if (report !== undefined) {
                results.push({ namespace, podName, containerName, plural, event: 'add', report })
            }
        }
        return results
    }

    // ─── PRIVATE ────────────────────────────────────────────────────────────────

    private createInformer = (plural: string) => {
        const handlers: ICrdInformerHandlers = {
            onAdd:    (obj: any) => this.processInformerEvent(plural, 'add', obj),
            onUpdate: (obj: any) => this.processInformerEvent(plural, 'update', obj),
            onDelete: (obj: any) => this.processInformerEvent(plural, 'delete', obj),
            onError:  (err: any) => {
                try {
                    this.log.error(`informer error (${plural}): ${err}`)
                    if (err['HTTP-Code'] === '404' || err.statusCode === 404 || err.code === 404)
                        this.log.warning(`CRD ${plural} not found, informer will not restart`)
                    else {
                        const informer = this.informers.get(plural)
                        if (informer) setTimeout(() => { informer.start(); this.log.info(`informer ${plural} restarted`) }, 5000)
                    }
                } catch (e) { this.log.error(`error managing informer error (${plural}): ${e}`) }
            }
        }
        return createCrdInformer(this.clusterInfo, TRIVY_API_GROUP, TRIVY_API_VERSION, plural, handlers)
    }

    /** Builds the provider event from the CRD object (informer or LIST). */
    private buildProviderEvent = (plural: string, event: 'add' | 'update' | 'delete', obj: any): ITrivyProviderEvent => {
        const labels = obj.metadata?.labels ?? {}
        return {
            namespace: labels['trivy-operator.resource.namespace'],
            podName: labels['trivy-operator.resource.name'],
            containerName: labels['trivy-operator.container.name'],
            kind: labels['trivy-operator.resource.kind'],
            plural, event,
            report: event !== 'delete' ? obj.report : undefined
        }
    }

    private processInformerEvent = (plural: string, event: 'add' | 'update' | 'delete', obj: any) => {
        // EventsProvider style: the provider forwards the report the informer's object
        // already carries (without re-querying the API) to every subscriber whose
        // `reportTypes` includes this plural. Filtering by concrete asset is the channel's job.
        const providerEvent = this.buildProviderEvent(plural, event, obj)
        for (const [subscriber, subData] of this.subscribers) {
            if (!subData.reportTypes.includes(plural)) continue
            this.deliveries++
            subscriber.processProviderEvent(this.id, providerEvent)
        }
    }

    /**
     * Initial state sync for a freshly registered subscriber (RC-1): it lists the
     * current CRDs of the plurals it asked for and dispatches one 'add' per each,
     * ONLY to it. It is idempotent with respect to the 'add's the informer may deliver
     * (a per-report reducer deduplicates by id). Failure-tolerant per plural.
     */
    private sendInitialState = async (subscriber: IProviderSubscriber, reportTypes: string[]) => {
        for (const plural of reportTypes) {
            try {
                const res: { items?: any[] } = await this.clusterInfo.crdApi.listCustomObjectForAllNamespaces({ group: TRIVY_API_GROUP, version: TRIVY_API_VERSION, plural })
                for (const obj of (res.items ?? [])) {
                    this.deliveries++
                    subscriber.processProviderEvent(this.id, this.buildProviderEvent(plural, 'add', obj))
                }
            }
            catch (err) {
                this.log.error(`initial-state sync error (${plural}): ${err}`)
            }
        }
    }

    /**
     * Reads the cluster's Trivy version and pushes it as a "meta" event ONLY to this
     * subscriber. The scanner version (the `trivy.tag` configmap) governs the check
     * catalogue; the operator's (its image tag) is metadata. Failure-tolerant: when
     * Trivy is not installed, an empty meta is delivered.
     */
    private sendTrivyMeta = async (subscriber: IProviderSubscriber) => {
        const meta = await this.readTrivyMeta()
        const event: ITrivyMetaEvent = { eventKind: ETrivyEventKind.META, meta }
        this.deliveries++
        subscriber.processProviderEvent(this.id, event)
    }

    private readTrivyMeta = async (): Promise<ITrivyMeta> => {
        const meta: ITrivyMeta = {}
        try {
            const cm = await this.clusterInfo.coreApi.readNamespacedConfigMap({ name: TRIVY_CONFIGMAP, namespace: TRIVY_NS })
            meta.trivyVersion = cm.data?.['trivy.tag']
        }
        catch (err) {
            this.log.warning(`Could not read ${TRIVY_CONFIGMAP} (is Trivy Operator installed?): ${err instanceof Error ? err.message : err}`)
        }
        try {
            const dep = await this.clusterInfo.appsApi.readNamespacedDeployment({ name: TRIVY_OPERATOR_DEPLOY, namespace: TRIVY_NS })
            meta.operatorVersion = this.parseImageTag(dep.spec?.template?.spec?.containers?.[0]?.image)
        }
        catch (err) {
            this.log.warning(`Could not read the trivy-operator deployment: ${err instanceof Error ? err.message : err}`)
        }
        return meta
    }

    private parseImageTag = (image: string | undefined): string | undefined => {
        if (!image) return undefined
        const lastColon = image.lastIndexOf(':')
        // avoids confusing the registry port's ':' with the tag's
        if (lastColon < 0 || image.indexOf('/', lastColon) >= 0) return undefined
        return image.slice(lastColon + 1)
    }

    private getCrdName = async (namespace: string, podName: string, containerName?: string): Promise<string | undefined> => {
        try {
            const podData = await this.clusterInfo.coreApi.readNamespacedPod({ name: podName, namespace })
            const ctrl = podData.metadata?.ownerReferences?.find((or: any) => or.controller)
            if (ctrl) return `${ctrl.kind.toLowerCase()}-${ctrl.name}${containerName ? '-' + containerName : ''}`
            return `pod-${podName}${containerName ? '-' + containerName : ''}`
        } catch (err) {
            this.log.error(`cannot get CRD name: ${err}`)
            return undefined
        }
    }

    private getReport = async (plural: string, asset: ITrivyAsset, withContainer: boolean): Promise<any | undefined> => {
        try {
            const crdName = await this.getCrdName(asset.namespace, asset.podName, withContainer ? asset.containerName : undefined)
            if (!crdName) return undefined
            const crdObject = await this.clusterInfo.crdApi.getNamespacedCustomObject({ group: TRIVY_API_GROUP, version: TRIVY_API_VERSION, namespace: asset.namespace, plural, name: crdName })
            return crdObject.report
        } catch (err) {
            this.log.error(`getReport error (${plural}): ${err}`)
            return undefined
        }
    }
}

export default TrivyProvider
