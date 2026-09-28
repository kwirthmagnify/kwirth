//transient
enum ClusterTypeEnum {
    KUBERNETES = 'kubernetes'
}

/*
    Where the resources this Kwirth observes come from. There are only two answers: from a Kubernetes
    cluster, or from nowhere.

    NONE is not a half-done startup: it is the honest answer when there is no Kubernetes API at hand. A
    Kwirth like that goes on serving the front end, goes on carrying AUTONOMOUS channels — those that
    declare 'cluster' and 'resourced' false and start with the 'none' view — and from it one can federate
    against another Kwirth or point at a cluster by mounting a kubeconfig. Without this value one would
    have to declare oneself KUBERNETES with no Kubernetes, and the front end would go off listing pods
    against nothing.

    DOCKER was here: Kwirth was going to manage containers and compose projects as if they were a cluster.
    That route was abandoned. Docker is still a place to RUN in — EExecutionEnvironment says that — but
    not a source of resources.

    MIND: this does NOT decide capabilities, it is DERIVED from them. What rules is the execution
    environment plus whatever is checked at startup.
*/
enum EClusterType {
    KUBERNETES = 'kubernetes',
    NONE = 'none'
}

/*
    Which Kubernetes distribution this is. Detected from the clues each one leaves on its nodes (see
    ClusterInfo.detectClusterName); UNKNOWN means none of them was recognised, and everything must keep
    working exactly the same in that case.

    This was a free-form string until 2026-09-28, and it cost a feature: the front had a case for 'rk2e'
    -- a typo of 'rke2' -- with its icon and its label, and it never ran once, because nothing ever
    produced that value. Nobody noticed, because a string that nobody matches fails silently.
*/
/*
    What a Rancher is to this cluster, when there is one. Rancher calls 'local' the cluster it runs on and
    'downstream' the ones it manages from there, and the difference matters: the local one holds the
    Fleet workspaces and the whole delivery chain, a downstream one only receives.
*/
enum ERancherRole {
    NONE = '',                  // no Rancher managing this cluster
    LOCAL = 'local',            // this is the cluster Rancher itself runs on
    DOWNSTREAM = 'downstream'   // managed by a Rancher living somewhere else
}

enum EClusterFlavour {
    AKS = 'aks',                // Azure Kubernetes Service
    EKS = 'eks',                // Amazon Elastic Kubernetes Service
    GKE = 'gke',                // Google Kubernetes Engine
    OCP = 'ocp',                // OpenShift
    K3S = 'k3s',                // SUSE K3s
    K3D = 'k3d',                // k3s inside Docker containers
    RKE2 = 'rke2',              // SUSE RKE2
    HARVESTER = 'harvester',    // SUSE Harvester (HCI on top of Kubernetes)
    UNKNOWN = 'unknown'
}

/*
    Where this Kwirth runs. It is the result of getExecutionEnvironment() in the back end, which until now
    was lost as soon as the startup switch ended: the only thing that survived were derived and
    worse-informed fields. It is published because it is the fact everything else hangs off — what is at
    hand and where things are persisted — and because it is the first thing one wants to know when
    diagnosing somebody else's deployment.
*/
enum EExecutionEnvironment {
    KUBERNETES = 'kubernetes',  // inside a cluster, or against one through a kubeconfig
    DOCKER = 'docker',          // a loose container on a CRI
    DESKTOP = 'desktop',        // Electron/Tauri on the user's machine
    ECS = 'ecs'                 // an AWS ECS task (Fargate or EC2)
}

// How many back instances of a channel make sense per cluster.
enum EChannelInstances {
    MULTI = 'multi',    // several backs per cluster are valid (default: log, metrics, mirc…)
    SINGLE = 'single'   // exactly one back per cluster; home = in-cluster Kwirth
}

// Whether a channel's back is hosted by this Kwirth or lives elsewhere (resolved by the front-hub).
enum EChannelMode {
    LOCAL = 'local',    // hosted here (current behavior)
    REMOTE = 'remote'   // not hosted here; find it on the in-cluster Kwirth
}

interface IEndpointConfig {
    name: string,
    methods: string[]
    requiresAccessKey: boolean
}

interface BackChannelData {
    id: string
    routable: boolean  // instance can receive routed commands
    pauseable: boolean  // instance can be paused
    modifiable: boolean  // instance can be modified
    reconnectable: boolean  // instance supports client reconnect requests
    sources: string[]  // array of sources (kubernetes, docker...)
    metrics: boolean  // this channel requires metrics provider
    endpoints: IEndpointConfig[]  // array of specific endpoints the channel requires (usually this would be empty)
    websocket: boolean  // this channel allows websocket creation (aside from main websocket communication)
    cluster: boolean    // this channel supports cluster-wide invocation (addObject called once with *all)
    resourced: boolean  // this channel supports resource-based invocation (addObject called per selected resource)
    /*
        BOTH false = autonomous channel: it needs nothing from the cluster and can ONLY be started with
        the 'none' view, which invokes addObject once with empty selectors. Use it for a channel whose
        data does not live in the cluster (an external API, for instance): declaring 'cluster' instead
        would make the core register the instance as holding a cluster-wide access key, which is
        unjustified privilege and noise in the audit trail for a channel that never looks at a pod.
    */
    mode?: EChannelMode  // hosted here (local) or elsewhere (remote); set by the core when announcing channels
}

interface KwirthData {
    version: string
    lastVersion: string
    clusterName: string
    clusterType: EClusterType                       // de donde salen los recursos (NONE = de ningun sitio)
    executionEnvironment: EExecutionEnvironment     // donde corre este Kwirth
    inCluster: boolean
    isDesktop: boolean
    namespace: string
    deployment: string
    metricsInterval: number
    channels: BackChannelData[]
}

interface IBackChannelRequirements {
    storage: boolean
    providers: string[]
    instances?: EChannelInstances   // default MULTI; SINGLE = one back per cluster (home = in-cluster)
}

/*
    The prefix of the id a PLUVIDER is referenced by: a plugin that also produces information and exposes
    it in-process, so that other plugins can subscribe to it.

    The complete id is '<PLUVIDER_ID_PREFIX><channelId>' and the core ALWAYS composes it, so that the
    plugin's author cannot get the prefix wrong. A consumer uses it just like a provider's, both in
    'requirements.providers' and in 'addSubscriber'.

    It lives in common because the front end needs it too, in order to tell a pluvider from an installed
    provider when it shows them.
*/
const PLUVIDER_ID_PREFIX = 'plugin:'

export { ClusterTypeEnum, KwirthData, BackChannelData, EClusterType, EClusterFlavour, ERancherRole, EExecutionEnvironment, EChannelInstances, EChannelMode, IBackChannelRequirements, PLUVIDER_ID_PREFIX }
