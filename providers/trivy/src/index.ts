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
        this.subscribers.set(c, data ?? { reportTypes: ALL_PLURALS, assets: [] })
        console.log(`[trivy-provider] subscriber added, total: ${this.subscribers.size}`)
    }

    removeSubscriber = async (c: IProviderSubscriber) => {
        this.subscribers.delete(c)
        console.log(`[trivy-provider] subscriber removed, total: ${this.subscribers.size}`)
    }

    updateSubscription = async (c: IProviderSubscriber, data: ITrivySubscriptionData) => {
        if (this.subscribers.has(c)) {
            this.subscribers.set(c, data)
            console.log(`[trivy-provider] subscription updated, assets: ${data.assets.length}`)
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

    private processInformerEvent = async (plural: string, event: 'add' | 'update' | 'delete', obj: any) => {
        const isAudit = plural === TRIVY_API_AUDIT_PLURAL
        for (const [subscriber, subData] of this.subscribers) {
            if (!subData.reportTypes.includes(plural)) continue
            const asset = subData.assets.find(a =>
                obj.metadata.labels['trivy-operator.resource.kind'] === 'Pod' &&
                (isAudit || a.containerName === obj.metadata.labels['trivy-operator.container.name']) &&
                a.namespace === obj.metadata.labels['trivy-operator.resource.namespace'] &&
                a.podName.startsWith(obj.metadata.labels['trivy-operator.resource.name'])
            )
            if (!asset) continue
            let report: any = undefined
            if (event !== 'delete') report = await this.getReport(plural, asset, !isAudit)
            const providerEvent: ITrivyProviderEvent = { namespace: asset.namespace, podName: asset.podName, containerName: asset.containerName, plural, event, report }
            subscriber.processProviderEvent(this.id, providerEvent)
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
