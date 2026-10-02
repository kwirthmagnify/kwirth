import { IInstanceMessage, IExtensionScope } from "@kwirthmagnify/kwirth-common"

// ─── Authorisation scopes (Trivy's own RBAC) ──────────────────────────────────
// Namespaced with 'trivy$' (the project convention). They define the channel's access ladder.
export enum ETrivyScope {
    WORKLOAD = 'trivy$workload',        // access to workload reports (namespaced)
    KUBERNETES = 'trivy$kubernetes'     // + cluster-level reports (cluster-scoped)
}

// Catalogue of scopes Trivy declares (the channel exposes it through getScopeCatalog() in front and
// back); it populates the security editor (User/API) and serves to validate permissions.
export const TRIVY_SCOPES: IExtensionScope[] = [
    { scope: ETrivyScope.WORKLOAD,   label: 'Trivy · Workload',   description: 'Access workload-scoped reports (vulnerabilities, config audit, secrets)' },
    { scope: ETrivyScope.KUBERNETES, label: 'Trivy · Kubernetes', description: 'Access cluster-scoped reports (RBAC, infra assessment)' }
]

export enum ETrivyCommand {
    RESCAN = 'rescan'
}

export interface ITrivyMessage extends IInstanceMessage {
    msgtype: 'trivymessage'
    id: string
    accessKey: string
    instance: string
    namespace: string
    group: string
    pod: string
    container: string
    command: ETrivyCommand
    params?: string[]
}

export interface ITrivyMessageResponse extends IInstanceMessage {
    msgtype: 'trivymessageresponse'
    id: string
    namespace: string
    group: string
    pod: string
    container: string
    msgsubtype?: string
    data?: any
}

export interface IKnown {
    name: string
    namespace: string
    container: string
    report: any
}

export interface IUnknown {
    name: string
    namespace: string
    container: string
    statusCode: number
    statusMessage: string
}

export interface ITrivyProviderEvent {
    namespace: string
    podName: string
    containerName: string
    plural: string
    event: 'add' | 'update' | 'delete'
    report?: any
}
