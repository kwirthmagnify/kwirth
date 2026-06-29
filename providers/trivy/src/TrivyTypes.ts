export const TRIVY_API_VERSION = 'v1alpha1'
export const TRIVY_API_GROUP = 'aquasecurity.github.io'
export const TRIVY_API_VULN_PLURAL = 'vulnerabilityreports'
export const TRIVY_API_AUDIT_PLURAL = 'configauditreports'
export const TRIVY_API_SBOM_PLURAL = 'sbomreports'
export const TRIVY_API_EXPOSED_PLURAL = 'exposedsecretreports'

export interface ITrivyAsset {
    namespace: string
    podName: string
    containerName: string
}

export interface ITrivySubscriptionData {
    // Único filtro a nivel de provider: qué tipos de reporte quiere el channel
    // (equivalente a `kinds` en EventsProvider). El provider reenvía TODOS los
    // reportes de estos tipos, de todo el cluster. El filtrado por asset concreto
    // (qué pod/container interesa) es responsabilidad del channel suscriptor, no
    // del provider — el provider no es cluster ni resourced.
    reportTypes: string[]
}

export interface ITrivyProviderEvent {
    namespace: string
    podName: string
    containerName: string
    plural: string
    event: 'add' | 'update' | 'delete'
    report?: any
    // Tipo del recurso dueño del reporte (Pod, ReplicaSet, Deployment…), tomado
    // de la label `trivy-operator.resource.kind`. Solo se rellena en el despacho
    // cluster-wide; los consumidores resourced lo ignoran.
    kind?: string
}
