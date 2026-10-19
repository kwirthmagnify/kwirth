import { IExtensionScope } from '@kwirthmagnify/kwirth-common'

/*
    What a user is allowed to do in Magnify.

    Until now Magnify declared NO scopes of its own: its ladder was `['', 'cluster', 'admin']`, so the
    only way to use it was `cluster` — which is admin-level over the whole product. There was no way to
    say 'look, but do not touch', and no way to say 'only this namespace'.

    The ladder is a ladder: each level grants everything below it. `cluster` and `admin` stay above all
    three, as they do in every channel.
*/
export enum EMagnifyScope {
    /*
        Open Magnify and see how the cluster is DOING — its metrics and its event feed — without seeing
        what is in it.

        🔴 It does not list resources, and that is not an oversight. A listing carries the objects whole:
        a ConfigMap arrives with its data, a Secret with its own. There is no separate 'give me the
        contents of this one' command, so 'names and relations' and 'contents' are the same answer, and
        splitting them would mean stripping fields object by object — where whatever was left in by
        mistake is a leak.
    */
    USER = 'magnify$user',
    /*
        See what the cluster HAS: the resources, with their contents.

        🔴 The resources a DEVELOPER works with — workloads and configuration, in the namespaces the key
        reaches. The infrastructure (Nodes, CRDs, PersistentVolumes, ClusterRoles, StorageClasses) is not
        here: it asks for 'cluster', because it is the installation and not a slice of it.
    */
    READ = 'magnify$read',
    /** Change the cluster: apply, delete, evict, drain, scale, restart… */
    WRITE = 'magnify$write'
}

/*
    The kinds Magnify can list. They are the options of the form that narrows `magnify$read`, so the
    admin ticks names instead of typing them — a kind typed with a typo hides nothing and says nothing.

    ⚠️ It is the list `executeList` knows how to serve. A kind missing from here cannot be hidden, which
    is why they are kept together: adding a `case` there without adding it here creates a resource that
    cannot be restricted.
*/
export const MAGNIFY_KINDS: string[] = [
    'CSIDriver', 'CSINode', 'CSIStorageCapacity', 'ClusterRole', 'ClusterRoleBinding', 'ComponentStatus',
    'ConfigMap', 'CronJob', 'CustomResourceDefinition', 'DaemonSet', 'Deployment', 'Endpoints',
    'HorizontalPodAutoscaler', 'Ingress', 'IngressClass', 'Job', 'Lease', 'LimitRange',
    'MutatingWebhookConfiguration', 'Namespace', 'NetworkPolicy', 'Node', 'NodeMetrics',
    'PersistentVolume', 'PersistentVolumeClaim', 'Pod', 'PodDisruptionBudget', 'PodMetrics',
    'PriorityClass', 'ReplicaSet', 'ReplicationController', 'ResourceQuota', 'Role', 'RoleBinding',
    'RuntimeClass', 'Secret', 'Service', 'ServiceAccount', 'StatefulSet', 'StorageClass',
    'ValidatingWebhookConfiguration', 'VolumeAttachment'
]

/** The field of the thin scope's configuration. The channel is the only one that knows what it means. */
export const MAGNIFY_HIDE_KINDS = 'hideKinds'

export const MAGNIFY_SCOPES: IExtensionScope[] = [
    {
        scope: EMagnifyScope.USER,
        label: 'Magnify · User',
        description: 'Open Magnify and see the cluster health: its metrics and its events. It does NOT list resources'
    },
    {
        scope: EMagnifyScope.READ,
        label: 'Magnify · Read',
        description: "Also see the cluster's workloads and configuration, with their contents. NOT its infrastructure (nodes, CRDs, cluster roles…), which needs 'cluster'",
        /*
            Narrowing READ by KIND, because that is what Magnify knows how to describe and the core does
            not. 'Everything except ConfigMaps and Secrets' is the case this exists for: the two kinds
            that carry credentials in a cluster where everything else is harmless to look at.

            ⚠️ It hides, it does not allow — so a kind that appears LATER (a new CRD) is visible unless
            somebody adds it. The opposite, listing what may be seen, fails closed but is 43 entries that
            rot. The guide says which way it fails.
        */
        config: [{
            name: MAGNIFY_HIDE_KINDS,
            label: 'Hidden kinds',
            type: 'multiselect',
            options: MAGNIFY_KINDS
        }]
    },
    {
        scope: EMagnifyScope.WRITE,
        label: 'Magnify · Write',
        description: "Also change those workloads: apply, delete, evict, scale and restart. NOT the infrastructure — draining or cordoning a node needs 'cluster'"
    }
]

/*
    The core's two scopes that sit above every channel's own. They are not Magnify's to define — they are
    named here because its ladder has to place them, and because the preferences panel asks for 'admin'
    to decide whether to offer the extension managers, which belong to the core and not to this channel.
*/
export const MAGNIFY_CLUSTER_SCOPE = 'cluster'
export const MAGNIFY_ADMIN_SCOPE = 'admin'

/*
    Highest wins, and anything this does not know is -1 — which is what makes an unknown token, a renamed
    scope or a thin scope aimed at another channel grant nothing without a line of code.
*/
export const MAGNIFY_SCOPE_LADDER: string[] = [
    '', EMagnifyScope.USER, EMagnifyScope.READ, EMagnifyScope.WRITE, MAGNIFY_CLUSTER_SCOPE, MAGNIFY_ADMIN_SCOPE
]
