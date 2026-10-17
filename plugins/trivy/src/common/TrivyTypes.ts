import { IInstanceMessage, IExtensionScope } from "@kwirthmagnify/kwirth-common"

// ─── Authorisation scopes (Trivy's own RBAC) ──────────────────────────────────
// Namespaced with 'trivy$' (the project convention). They define the channel's access ladder.
/*
    'user' is the minimum: open the channel and read workload reports. It replaces 'trivy$workload',
    which did two jobs at once —being allowed to USE Trivy and being allowed to see workload reports—
    and so could not express either. Naming the minimum after one of the capabilities is what made it
    confusing, and it is the same shape the other channels use ('agora$user', 'fileman$user').

    ⚠️ BREAKING: 'trivy$workload' no longer exists. It was declared in the catalogue and grantable, so
    any key carrying it drops to level -1 and grants NOTHING for this channel until it is re-granted as
    'trivy$user'. Failing closed is the right way round, but it has to be said out loud.
*/
export enum ETrivyScope {
    USER = 'trivy$user',                // use the channel and read workload reports (namespaced)
    KUBERNETES = 'trivy$kubernetes'     // + cluster-level reports (cluster-scoped)
}

// Catalogue of scopes Trivy declares (the channel exposes it through getScopeCatalog() in front and
// back); it populates the security editor (User/API) and serves to validate permissions.
export const TRIVY_SCOPES: IExtensionScope[] = [
    { scope: ETrivyScope.USER,       label: 'Trivy · User',       description: 'Use Trivy: open the channel and read workload reports (vulnerabilities, config audit, secrets)' },
    { scope: ETrivyScope.KUBERNETES, label: 'Trivy · Kubernetes', description: 'Also read cluster-scoped reports (RBAC, infra assessment)' }
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
