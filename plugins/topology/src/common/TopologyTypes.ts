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
