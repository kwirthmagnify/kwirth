export const TRIVY_API_VULN_PLURAL = 'vulnerabilityreports'
export const TRIVY_API_AUDIT_PLURAL = 'configauditreports'
export const TRIVY_API_SBOM_PLURAL = 'sbomreports'
export const TRIVY_API_EXPOSED_PLURAL = 'exposedsecretreports'

/** A report that belongs to a workload and not to one of its containers (the config audit). */
export interface IWorkloadReports {
    kind?: string
    reports: Record<string, any>
}

export interface ITrivyData {
    paused: boolean
    started: boolean
    assets: IAsset[]
    /*
        Workload-level reports by `namespace/name`, kept because they can arrive BEFORE the cards they
        belong to. Without this the order the cluster sends its reports in decided whether the audit
        showed up at all.
    */
    workloadReports: Record<string, IWorkloadReports>
    ri: string | undefined
    mode: 'list' | 'card'
}

export class TrivyData implements ITrivyData {
    mode: 'list' | 'card' = 'card'
    started = false
    paused = false
    assets = []
    workloadReports = {}
    ri = undefined
}

export interface IAsset {
    name: string
    namespace: string
    container: string
    /*
        What the name refers to: 'ReplicaSet', 'DaemonSet', 'Pod'…

        🔴 Needed on screen because Trivy names a report after the OWNER of the pods it scanned, so most
        rows are a controller and read exactly like a pod. Without it there is no way to tell which of
        the two you are looking at.
    */
    kind?: string
    unknown: { statusCode: number; statusMessage: string }
    vulnerabilityreports: { report: any }
    configauditreports: { report: any }
    sbomreports: { report: any }
    exposedsecretreports: { report: any }
}
