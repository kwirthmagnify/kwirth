export const TRIVY_API_VULN_PLURAL = 'vulnerabilityreports'
export const TRIVY_API_AUDIT_PLURAL = 'configauditreports'
export const TRIVY_API_SBOM_PLURAL = 'sbomreports'
export const TRIVY_API_EXPOSED_PLURAL = 'exposedsecretreports'

export interface ITrivyData {
    paused:boolean
    started:boolean
    assets: IAsset[]
    ri:string|undefined
    mode: 'list'|'card'
}

export class TrivyData implements ITrivyData{
    mode: 'list' | 'card' = 'card'
    started = false
    paused = false
    score = 0
    assets = []
    ri = undefined
}

export interface IAsset {
    name: string
    namespace: string
    container: string
    unknown: {
        statusCode: number
        statusMessage: string
    }
    vulnerabilityreports: {
        report: any
    }
    configauditreports: {
        report: any
    }
    sbomreports: {
        report: any
    }
    exposedsecretreports: {
        report: any
    }
}
