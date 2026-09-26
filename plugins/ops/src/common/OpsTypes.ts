import { IInstanceMessage, IExtensionScope } from "@kwirthmagnify/kwirth-common"

// ─── Authorisation scopes (Ops's own RBAC) ────────────────────────────────────
// Namespaced with 'ops$' (the project convention). They define the channel's access ladder.
// Only the scopes the channel REALLY enforces are declared: GET (describe/get) and RESTART
// (restart/restartpod/restartns). The interactive shell is not gated today (there is no ops$shell/execute).
export enum EOpsScope {
    GET = 'ops$get',            // view/describe resources
    RESTART = 'ops$restart'     // restart workloads (pods, containers, deployments)
}

// Catalogue of scopes Ops declares (the channel exposes it through getScopeCatalog() in front and back);
// it populates the security editor (User/API) and serves to validate permissions.
export const OPS_SCOPES: IExtensionScope[] = [
    { scope: EOpsScope.GET,     label: 'Ops · Get',     description: 'View and describe resources' },
    { scope: EOpsScope.RESTART, label: 'Ops · Restart', description: 'Restart workloads (pods, containers, deployments)' }
]

export enum EOpsCommand {
    DESCRIBE = 'describe',
    //EXECUTE = 'execute',
    RESTART = 'restart',
    RESTARTPOD = 'restartpod',
    RESTARTNS = 'restartns'
}

export interface IOpsMessage extends IInstanceMessage {
    msgtype: 'opsmessage'
    id: string
    accessKey: string
    instance: string
    namespace: string
    group: string
    pod: string
    container: string
    command: EOpsCommand
    params?: string[]
}

export interface IOpsMessageResponse extends IInstanceMessage {
    msgtype: 'opsmessageresponse'
    id: string
    command: EOpsCommand
    namespace: string
    group: string
    pod: string
    container: string
    data?: any
}

export interface IOpsInstanceConfig {
    sessionKeepAlive: boolean
}
