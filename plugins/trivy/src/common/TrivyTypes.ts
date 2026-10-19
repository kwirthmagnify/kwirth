import { IInstanceMessage, IExtensionScope, parseResources } from "@kwirthmagnify/kwirth-common"

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

/** This channel's ladder, in one place so the back and the front cannot read it differently. */
export const TRIVY_SCOPE_LADDER: string[] = ['', ETrivyScope.USER, 'cluster', 'admin']

/*
    Does this key reach `required`? The back uses `scopeAllows` of common-back; this exists because the
    FRONT cannot — common-back is resolved from the core's server-side global, which does not exist in a
    browser — and the front has to ask the same question to avoid offering a button whose every action
    will answer 403.

    🔴 SECOND copy of the same walk: Magnify wrote one in its own `src/common` three days ago for the
    same reason. The condition recorded there was 'if a second channel copies it, the helper belongs in
    `common`', and this is that second channel — moving `scopeAllows` down from common-back to common is
    the next step, and then this goes away.
*/
export const keyReaches = (resources: string, required: string): boolean => {
    const level = (scope: string) => TRIVY_SCOPE_LADDER.indexOf(scope)
    try {
        return parseResources(resources).some(r => r.scopes.split(',').some(sc => level(sc) >= level(required)))
    }
    catch (err) { return false }
}
