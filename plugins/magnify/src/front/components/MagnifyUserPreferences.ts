import { ICustomAction } from "./UserPreferences"

export interface IKind {
    name: string
    priority: number
}

export const allKinds: IKind[] = [ 
    {name:'ComponentStatus',priority:5},
    {name:'Node',priority:1},
    {name:'V1APIResource',priority:5},
    {name:'Namespace',priority:1},
    {name:'NodeMetrics',priority:3},
    {name:'Pod',priority:2},
    {name:'PodMetrics',priority:3},
    {name:'Deployment',priority:2},
    {name:'DaemonSet',priority:2},
    {name:'ReplicaSet',priority:2},
    {name:'ReplicationController',priority:2},
    {name:'StatefulSet',priority:2},
    {name:'Job',priority:2},
    {name:'CronJob',priority:2},
    {name:'ConfigMap',priority:2},
    {name:'Secret',priority:2},
    {name:'ResourceQuota',priority:4},
    {name:'LimitRange',priority:4},
    {name:'HorizontalPodAutoscaler',priority:4},
    {name:'PodDisruptionBudget',priority:4},
    {name:'PriorityClass',priority:4},
    {name:'RuntimeClass',priority:4},
    {name:'Lease',priority:9},
    {name:'ValidatingWebhookConfiguration',priority:8},
    {name:'MutatingWebhookConfiguration',priority:8},
    {name:'Service',priority:2},
    {name:'Endpoints',priority:3},
    {name:'Ingress',priority:2},
    {name:'IngressClass',priority:5},
    {name:'NetworkPolicy',priority:3},
    {name:'PersistentVolumeClaim',priority:2},
    {name:'PersistentVolume',priority:2},
    {name:'StorageClass',priority:3},
    {name:'VolumeAttachment',priority:4},
    {name:'CSIDriver',priority:5},
    {name:'CSINode',priority:5},
    {name:'CSIStorageCapacity',priority:5},
    {name:'ServiceAccount',priority:5},
    {name:'ClusterRole',priority:2},
    {name:'Role',priority:2},
    {name:'ClusterRoleBinding',priority:2},
    {name:'RoleBinding',priority:2},
    {name:'CustomResourceDefinition',priority:4},
    {name:'CRD Instances',priority:4}    
].sort((a,b) => a.priority-b.priority)

export class MagnifyDataConfig {
    source: IKind[] = allKinds
    sync: IKind[] = allKinds
}

export class MagnifyUserPreferences {
    palette = 'light'
    logLines = 5000
    dataConfig = new MagnifyDataConfig()
    dataHelm = false
    dataManagedFields = false
    tracing = false
    customActions:ICustomAction[] = []
}
