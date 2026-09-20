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

// Suscriptor que solo apunta lo que recibe. `throwOnEvent` imita al que se cae al recibir (un ws cerrado,
// por ejemplo): el provider no puede convertir eso en un unhandled rejection.
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
    // CRDs que devuelve el LIST, por plural. Lo que no este aqui responde con lista vacia.
    items?: Record<string, any[]>
    // el LIST de estos plurales falla, para ejercitar la tolerancia por tipo de reporte
    failingPlurals?: string[]
    // Trivy no instalado: el configmap y el deployment del operator no existen
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

// El alta lanza trabajo en paralelo a proposito (no se espera), asi que hay que dejar correr la cola de
// microtareas antes de mirar lo que ha llegado.
export const settle = async (): Promise<void> => {
    for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve))
}
