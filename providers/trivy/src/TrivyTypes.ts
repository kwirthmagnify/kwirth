export const TRIVY_API_VERSION = 'v1alpha1'
export const TRIVY_API_GROUP = 'aquasecurity.github.io'
export const TRIVY_API_VULN_PLURAL = 'vulnerabilityreports'
export const TRIVY_API_AUDIT_PLURAL = 'configauditreports'
export const TRIVY_API_SBOM_PLURAL = 'sbomreports'
export const TRIVY_API_EXPOSED_PLURAL = 'exposedsecretreports'
export const TRIVY_API_RBAC_PLURAL = 'rbacassessmentreports'                // namespaced (Role/RoleBinding)
export const TRIVY_API_CLUSTER_RBAC_PLURAL = 'clusterrbacassessmentreports'  // cluster-scoped (ClusterRole/binding)

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

// ─── Evento "meta": info de la instalación de Trivy (no es un reporte) ────────
// El provider lo empuja al suscriptor en el estado inicial (ver index.ts). Así el
// provider es la única fuente de verdad de la versión de Trivy del cluster y los
// consumidores no re-derivan configmaps/deployments del trivy-operator.

/** Clase de evento que el provider empuja al suscriptor. */
export enum ETrivyEventKind {
    REPORT = 'report',   // evento de reporte CRD (por defecto: el report event no lleva eventKind)
    META = 'meta'        // metadatos de la instalación de Trivy
}

/** Versión de Trivy del cluster (scanner + operator). */
export interface ITrivyMeta {
    trivyVersion?: string      // tag del scanner (configmap trivy.tag) — rige el catálogo de checks
    operatorVersion?: string   // tag de imagen del trivy-operator — metadato
}

/** Evento meta: entrega la info de la instalación de Trivy al suscribirse. */
export interface ITrivyMetaEvent {
    eventKind: ETrivyEventKind.META
    meta: ITrivyMeta
}
