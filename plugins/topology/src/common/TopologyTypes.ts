export enum ETopoAction {
    ADDED               = 'ADDED',
    MODIFIED            = 'MODIFIED',
    DELETED             = 'DELETED',
    ENDPOINTS_RESULT    = 'ENDPOINTS_RESULT',
    INGRESS_RULES_RESULT = 'INGRESS_RULES_RESULT',
    SCALE               = 'SCALE',
    RESTART             = 'RESTART',
    DELETE_POD          = 'DELETE_POD',
    GET_ENDPOINTS       = 'GET_ENDPOINTS',
    GET_INGRESS_RULES   = 'GET_INGRESS_RULES',
}

export enum ETopologyQueryKind {
    ENDPOINTS     = 'endpoints',
    INGRESS_RULES = 'ingress-rules',
}

export enum ETopologyMenuAction {
    VIEW_PATH     = 'view-path',
    DETAILS       = 'details',
    COPY_NAME     = 'copy-name',
    SHELL         = 'shell',
    LOGS          = 'logs',
    SCALE_UP      = 'scale-up',
    SCALE_ZERO    = 'scale-zero',
    RESTART       = 'restart',
    DELETE_POD    = 'delete-pod',
    ENDPOINTS     = 'endpoints',
    INGRESS_RULES = 'ingress-rules',
}

export enum ETopologyNodeKind {
    INGRESS                = 'Ingress',
    SERVICE                = 'Service',
    DEPLOYMENT             = 'Deployment',
    STATEFULSET            = 'StatefulSet',
    DAEMONSET              = 'DaemonSet',
    REPLICASET             = 'ReplicaSet',
    JOB                    = 'Job',
    CRONJOB                = 'CronJob',
    POD                    = 'Pod',
    CONTAINER              = 'Container',
    PERSISTENTVOLUMECLAIM  = 'PersistentVolumeClaim',
}

export enum ETopologyNodeStatus {
    RUNNING     = 'Running',
    PENDING     = 'Pending',
    FAILED      = 'Failed',
    SUCCEEDED   = 'Succeeded',
    UNKNOWN     = 'Unknown',
    TERMINATING = 'Terminating',
    BOUND       = 'Bound',
    RELEASED    = 'Released',
    LOST        = 'Lost',
}
