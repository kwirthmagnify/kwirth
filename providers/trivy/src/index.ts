import { IProvider, IProviderSubscriber, createCrdInformer, ICrdInformerHandlers } from '@kwirthmagnify/kwirth-common-back'
import { ITrivyAsset, ITrivySubscriptionData, ITrivyProviderEvent, ITrivyMeta, ITrivyMetaEvent, ETrivyEventKind, TRIVY_API_VERSION, TRIVY_API_GROUP, TRIVY_API_VULN_PLURAL, TRIVY_API_AUDIT_PLURAL, TRIVY_API_SBOM_PLURAL, TRIVY_API_EXPOSED_PLURAL, TRIVY_API_RBAC_PLURAL, TRIVY_API_CLUSTER_RBAC_PLURAL } from './TrivyTypes'

const ALL_PLURALS = [TRIVY_API_VULN_PLURAL, TRIVY_API_AUDIT_PLURAL, TRIVY_API_SBOM_PLURAL, TRIVY_API_EXPOSED_PLURAL, TRIVY_API_RBAC_PLURAL, TRIVY_API_CLUSTER_RBAC_PLURAL]

// Where the Trivy version lives in the cluster (a standard trivy-operator installation).
const TRIVY_NS = 'trivy-system'
const TRIVY_CONFIGMAP = 'trivy-operator-trivy-config'
const TRIVY_OPERATOR_DEPLOY = 'trivy-operator'

/*
    What the core lends the provider to write its log with. Declared here structurally instead of
    imported from kwirth-common-back, so this provider does not depend on a particular version of
    that package. Once the contract is published this interface can go.
*/
interface IExtensionLogger {
    info(message: unknown): void
    warning(message: unknown): void
    error(message: unknown): void
}

export class TrivyProvider implements IProvider {
    public readonly id = 'trivy'
    /*
        Starts writing to the console — what it did before — and the core replaces it as soon as the
        provider is built. Note the console prefix said '[trivy-provider]', which is NOT the provider
        id: the core writes '[trivy]', the real one.
    */
    private log: IExtensionLogger = {
        info: (message: unknown) => console.log(`[trivy] ${message}`),
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
        Lo que este provider sabe de si mismo: cuantos consumidores tiene AHORA. El contrato
        (IProvider.getStats, opcional desde kwirth-common-back 0.5.50) pide que sea BARATO — se devuelve
        lo que ya se tiene, no se calcula —, y de aqui sale que kwirth pueda decir si esto esta siendo
        consumido o emitiendo para nadie.
    */
    /*
        Entregas desde que arranco: informers, sincronizacion inicial y envio de meta. Una por llamada
        a un suscriptor, no una por objeto producido — este provider filtra por reportTypes.
    */
    private deliveries = 0

    getStats = () => ({ subscribers: this.subscribers.size, events: this.deliveries })

    private informers: Map<string, any> = new Map()
    private clusterInfo: any

    constructor(clusterInfo: any, _kwirthData: unknown) {
        this.clusterInfo = clusterInfo
    }

    addSubscriber = async (c: IProviderSubscriber, data: ITrivySubscriptionData) => {
        /*
            Se normaliza MIRANDO reportTypes, y no con `data ?? ...`: un suscriptor que no pide tipos
            concretos manda un objeto VACIO, que no es nullish, asi que el valor por defecto no entraba y
            reportTypes se quedaba en undefined. Lo de despues era un `for...of undefined` en una promesa
            que nadie esperaba: unhandled rejection y el core entero abajo. Lo canto provider-debug, que
            se suscribe sin payload.
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
