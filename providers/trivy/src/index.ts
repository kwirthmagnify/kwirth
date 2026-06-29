import { IProvider, IProviderSubscriber, createCrdInformer, ICrdInformerHandlers } from '@kwirthmagnify/kwirth-common-back'
import { ITrivyAsset, ITrivySubscriptionData, ITrivyProviderEvent, TRIVY_API_VERSION, TRIVY_API_GROUP, TRIVY_API_VULN_PLURAL, TRIVY_API_AUDIT_PLURAL, TRIVY_API_SBOM_PLURAL, TRIVY_API_EXPOSED_PLURAL } from './TrivyTypes'

const ALL_PLURALS = [TRIVY_API_VULN_PLURAL, TRIVY_API_AUDIT_PLURAL, TRIVY_API_SBOM_PLURAL, TRIVY_API_EXPOSED_PLURAL]

export class TrivyProvider implements IProvider {
    public readonly id = 'trivy'
    public readonly providesRouter = false
    public router = undefined
    public routerAlias = undefined
    public readonly requiresApiKeyApi = false
    public apiKeyApi = undefined

    private subscribers: Map<IProviderSubscriber, ITrivySubscriptionData> = new Map()
    private informers: Map<string, any> = new Map()
    private clusterInfo: any

    constructor(clusterInfo: any, _kwirthData: unknown) {
        this.clusterInfo = clusterInfo
    }

    addSubscriber = async (c: IProviderSubscriber, data: ITrivySubscriptionData) => {
        const subData = data ?? { reportTypes: ALL_PLURALS }
        this.subscribers.set(c, subData)
        console.log(`[trivy-provider] subscriber added, total: ${this.subscribers.size}`)
        // RC-1: sync de estado inicial. El provider es compartido y sus informers
        // pueden haber entregado ya su LIST inicial a otros suscriptores; uno que
        // llega tarde se quedaría sin estado. Por eso, en cada alta listamos los
        // CRD actuales y los despachamos SOLO a este suscriptor. Proceso paralelo
        // (no se hace await) para no bloquear el alta.
        this.sendInitialState(c, subData.reportTypes)
    }

    removeSubscriber = async (c: IProviderSubscriber) => {
        this.subscribers.delete(c)
        console.log(`[trivy-provider] subscriber removed, total: ${this.subscribers.size}`)
    }

    updateSubscription = async (c: IProviderSubscriber, data: ITrivySubscriptionData) => {
        if (this.subscribers.has(c)) {
            this.subscribers.set(c, data)
            console.log(`[trivy-provider] subscription updated, reportTypes: ${data.reportTypes.join(',')}`)
        }
    }

    startProvider = async () => {
        console.log('[trivy-provider] starting — creating informers for all CRD types')
        for (const plural of ALL_PLURALS) {
            const informer = this.createInformer(plural)
            this.informers.set(plural, informer)
            informer.start()
        }
    }

    stopProvider = async () => {
        console.log('[trivy-provider] stopping informers')
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
                    console.error(`[trivy-provider] informer error (${plural}):`, err)
                    if (err['HTTP-Code'] === '404' || err.statusCode === 404 || err.code === 404)
                        console.log(`[trivy-provider] CRD ${plural} not found, informer will not restart`)
                    else {
                        const informer = this.informers.get(plural)
                        if (informer) setTimeout(() => { informer.start(); console.log(`[trivy-provider] informer ${plural} restarted`) }, 5000)
                    }
                } catch (e) { console.error(`[trivy-provider] error managing informer error (${plural}):`, e) }
            }
        }
        return createCrdInformer(this.clusterInfo, TRIVY_API_GROUP, TRIVY_API_VERSION, plural, handlers)
    }

    /** Construye el evento del provider a partir del objeto CRD (informer o LIST). */
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
        // Estilo EventsProvider: el provider reenvía el reporte que ya trae el objeto
        // del informer (sin re-consultar la API) a todo suscriptor cuyo `reportTypes`
        // incluya este plural. El filtrado por asset concreto lo hace el channel.
        const providerEvent = this.buildProviderEvent(plural, event, obj)
        for (const [subscriber, subData] of this.subscribers) {
            if (!subData.reportTypes.includes(plural)) continue
            subscriber.processProviderEvent(this.id, providerEvent)
        }
    }

    /**
     * Sync de estado inicial para un suscriptor recién dado de alta (RC-1): lista
     * los CRD actuales de los plurals que pidió y le despacha un 'add' por cada uno,
     * SOLO a él. Es idempotente respecto a los 'add' que el informer pueda entregar
     * (un reductor por reporte deduplica por id). Tolerante a fallos por plural.
     */
    private sendInitialState = async (subscriber: IProviderSubscriber, reportTypes: string[]) => {
        for (const plural of reportTypes) {
            try {
                const res: { items?: any[] } = await this.clusterInfo.crdApi.listCustomObjectForAllNamespaces({ group: TRIVY_API_GROUP, version: TRIVY_API_VERSION, plural })
                for (const obj of (res.items ?? [])) {
                    subscriber.processProviderEvent(this.id, this.buildProviderEvent(plural, 'add', obj))
                }
            }
            catch (err) {
                console.error(`[trivy-provider] initial-state sync error (${plural}):`, err)
            }
        }
    }

    private getCrdName = async (namespace: string, podName: string, containerName?: string): Promise<string | undefined> => {
        try {
            const podData = await this.clusterInfo.coreApi.readNamespacedPod({ name: podName, namespace })
            const ctrl = podData.metadata?.ownerReferences?.find((or: any) => or.controller)
            if (ctrl) return `${ctrl.kind.toLowerCase()}-${ctrl.name}${containerName ? '-' + containerName : ''}`
            return `pod-${podName}${containerName ? '-' + containerName : ''}`
        } catch (err) {
            console.error('[trivy-provider] cannot get CRD name:', err)
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
            console.error(`[trivy-provider] getReport error (${plural}):`, err)
            return undefined
        }
    }
}

export default TrivyProvider
