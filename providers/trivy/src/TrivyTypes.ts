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
    reportTypes: string[]
    assets: ITrivyAsset[]
}

export interface ITrivyProviderEvent {
    namespace: string
    podName: string
    containerName: string
    plural: string
    event: 'add' | 'update' | 'delete'
    report?: any
}
