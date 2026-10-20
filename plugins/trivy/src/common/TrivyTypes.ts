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
/*
    ⚠️ BREAKING (0.2.32): 'trivy$kubernetes' no longer exists either, and for a blunter reason than
    'trivy$workload' did — it gated a feature that was never built. It promised the cluster-scoped
    reports (RBAC, infra assessment) and this channel never asked for them: its list of report types has
    only the four namespaced ones. So it was grantable, it sat in the editor, and it changed nothing.

    A key carrying it drops to -1 and grants NOTHING for this channel until it is re-granted as
    'trivy$user'. Failing closed is the right way round, but it has to be said out loud.

    What takes its place is the line Magnify draws: what the key reaches is decided by its RESOURCES,
    and seeing everything is what 'cluster' means.
*/
export enum ETrivyScope {
    USER = 'trivy$user'     // open the channel and read the reports of what the key reaches
}

// Catalogue of scopes Trivy declares (the channel exposes it through getScopeCatalog() in front and
// back); it populates the security editor (User/API) and serves to validate permissions.
export const TRIVY_SCOPES: IExtensionScope[] = [
    { scope: ETrivyScope.USER, label: 'Trivy · User', description: "Open Trivy and read the reports (vulnerabilities, config audit, secrets) of the namespaces the key grants. 'cluster' reads them all, 'admin' also manages the operator" }
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
    /*
        WHAT this report is about: 'ReplicaSet', 'DaemonSet', 'Pod'…

        It travels because the screen cannot tell a controller from a pod without it, and the two look
        the same there: Trivy names a report after the owner of the pods it scanned, so most rows are a
        ReplicaSet wearing a pod's clothes.
    */
    kind?: string
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
    /*
        What the report is ABOUT: 'Deployment', 'ReplicaSet', 'Service', 'Ingress', 'Role'…

        The provider has always sent it; this channel simply did not declare it, so it was dropped on
        arrival — and with it the only way to tell a workload from anything else.
    */
    kind?: string
    plural: string
    event: 'add' | 'update' | 'delete'
    report?: any
}

/*
    What Trivy shows: WORKLOADS, the things that run containers.

    The trivy-operator writes a ConfigAuditReport for everything it audits — Services, Ingresses, Roles
    — and since this channel stopped being `resourced` all of them reached the screen, mixed in with the
    pods and with nothing saying which was which. They are dropped here.

    ⚠️ A report usually names the OWNER rather than the pod (a ReplicaSet for a Deployment's pods), which
    is why the owners are on the list and not just 'Pod'.
*/
export const TRIVY_WORKLOAD_KINDS: string[] = [
    'Pod', 'ReplicaSet', 'ReplicationController', 'Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob'
]

/** Whether a report is about a workload. An unlabelled report is not shown: it cannot be placed. */
export const isWorkloadKind = (kind?: string): boolean => !!kind && TRIVY_WORKLOAD_KINDS.includes(kind)

/*
    `TRIVY_SCOPE_LADDER` and `keyReaches` lived here and are GONE (0.3.0).

    They existed for one reason: the front had to decide whether to light up the 'Manage' button, and the
    front cannot use `scopeAllows` from common-back — that is resolved from the core's server-side
    global, which does not exist in a browser. So the ladder was walked a second time here.

    With the operator moved to the trivy PROVIDER, this channel's front asks no permission questions at
    all, and the copy went with the button. The back still has its ladder in `getChannelScopeLevel`,
    where it belongs, and uses common-back's `scopeAllows` against it.

    ℹ️ This was the SECOND copy, the one that made A13 of auth-hardening stop being a hypothesis —
    "if a second channel copies it, the helper belongs in `common`". Magnify's copy is still there, so
    the finding stands; this channel simply no longer contributes to it.
*/
