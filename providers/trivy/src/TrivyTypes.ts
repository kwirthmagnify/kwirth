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
    // The only provider-level filter: which report types the channel wants
    // (the equivalent of `kinds` in EventsProvider). The provider forwards ALL
    // reports of these types, from the whole cluster. Filtering by a concrete
    // asset (which pod or container is of interest) is the subscribing channel's
    // responsibility, not the provider's — the provider is neither cluster nor resourced.
    reportTypes: string[]
}

export interface ITrivyProviderEvent {
    namespace: string
    podName: string
    containerName: string
    plural: string
    event: 'add' | 'update' | 'delete'
    report?: any
    // Type of the resource that owns the report (Pod, ReplicaSet, Deployment…), taken
    // from the `trivy-operator.resource.kind` label. It is only filled in on the
    // cluster-wide dispatch; resourced consumers ignore it.
    kind?: string
}

// ─── The "meta" event: info about the Trivy installation (not a report) ──────
// The provider pushes it to the subscriber in the initial state (see index.ts). That way
// the provider is the single source of truth for the cluster's Trivy version, and
// consumers do not re-derive configmaps or deployments from the trivy-operator.

/** Class of event the provider pushes to the subscriber. */
export enum ETrivyEventKind {
    REPORT = 'report',   // CRD report event (the default: a report event carries no eventKind)
    META = 'meta'        // metadata about the Trivy installation
}

/** The cluster's Trivy version (scanner + operator). */
export interface ITrivyMeta {
    trivyVersion?: string      // scanner tag (the trivy.tag configmap) — governs the check catalogue
    operatorVersion?: string   // trivy-operator image tag — metadata
}

/** Meta event: delivers the Trivy installation info on subscribing. */
export interface ITrivyMetaEvent {
    eventKind: ETrivyEventKind.META
    meta: ITrivyMeta
}
