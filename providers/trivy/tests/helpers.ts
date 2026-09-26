import { IProviderSubscriber } from '@kwirthmagnify/kwirth-common-back'

/*
    Dobles para el provider trivy. El provider habla con tres APIs de Kubernetes y con sus suscriptores,
    y nada mas: con eso se puede ejercitar el alta de un suscriptor sin cluster ninguno.
*/

export interface ICapturedEvent {
    providerId: string
    event: any
}

export interface IFakeSubscriber extends IProviderSubscriber {
    events: ICapturedEvent[]
}

// A subscriber that only records what it receives. `throwOnEvent` mimics one that falls over on receipt
// (a closed ws, for instance): the provider must not turn that into an unhandled rejection.
export const fakeSubscriber = (throwOnEvent = false): IFakeSubscriber => {
    const events: ICapturedEvent[] = []
    return {
        events,
        processProviderEvent: (providerId: string, event: any): void => {
            events.push({ providerId, event })
            if (throwOnEvent) throw new Error('subscriber is gone')
        },
    }
}

export interface IFakeClusterOptions {
    // CRDs the LIST returns, by plural. Anything not here answers with an empty list.
    items?: Record<string, any[]>
    // the LIST of these plurals fails, to exercise the per-report-type tolerance
    failingPlurals?: string[]
    // Trivy not installed: the operator's configmap and deployment do not exist
    trivyMissing?: boolean
}

export interface IFakeCluster {
    clusterInfo: any
    listedPlurals: string[]
}

export const fakeCluster = (options: IFakeClusterOptions = {}): IFakeCluster => {
    const listedPlurals: string[] = []
    const clusterInfo = {
        crdApi: {
            listCustomObjectForAllNamespaces: async ({ plural }: { plural: string }) => {
                listedPlurals.push(plural)
                if (options.failingPlurals?.includes(plural)) throw new Error(`boom listing ${plural}`)
                return { items: options.items?.[plural] ?? [] }
            },
        },
        coreApi: {
            readNamespacedConfigMap: async () => {
                if (options.trivyMissing) throw new Error('configmaps "trivy-operator-trivy-config" not found')
                return { data: { 'trivy.tag': '0.58.1' } }
            },
            readNamespacedPod: async () => ({ metadata: { ownerReferences: [] } }),
        },
        appsApi: {
            readNamespacedDeployment: async () => {
                if (options.trivyMissing) throw new Error('deployments "trivy-operator" not found')
                return { spec: { template: { spec: { containers: [{ image: 'ghcr.io/aquasecurity/trivy-operator:0.24.1' }] } } } }
            },
        },
    }
    return { clusterInfo, listedPlurals }
}

// Registration deliberately kicks off work in parallel (it is not awaited), so the microtask queue has
// to be allowed to drain before looking at what arrived.
export const settle = async (): Promise<void> => {
    for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve))
}
