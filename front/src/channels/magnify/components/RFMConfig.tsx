import { IFileObject, ISpace } from '@jfvilas/react-file-manager'
import { Add, BarChart, CheckCircle, Delete, DeleteSweep, Edit, EditOff, FolderCopy, HomeRepairService, Info, Iso, PauseCircle, PauseCircleOutline, PlayCircle, PlayCircleOutline, RestartAlt, Search, StopCircle, Subject, Terminal, VerifiedUser } from '@mui/icons-material'
import { Cluster, Config, Customize, Kubernetes, Network, Pod, Security, Settings, Storage } from '../icons/Icons'

const spaces = new Map<string, ISpace>()

const menu:IFileObject[] = [
    {   name: 'Overview',
        isDirectory: true,
        path: '/overview',
        class: 'classOverview',
        layout: 'own'
    },



    // Cluster
    {   name: 'Cluster',
        isDirectory: true,
        path: '/cluster',
        class: 'classCluster',
        layout: 'own',
    },
    {   name: 'Overview',
        isDirectory: true,
        path: '/cluster/overview',
        class: 'classClusterOverview',
        layout: 'own',
    },
    {   name: 'Nodes',
        isDirectory: true,
        path: '/cluster/Node',
        class: 'classmenu',
        children: 'Node'
    },
    {   name: 'Namespaces',
        isDirectory: true,
        path: '/cluster/Namespace',
        class: 'classNamespace',
        children: 'Namespace'
    },
    {   name: 'API Resources',
        isDirectory: true,
        path: '/cluster/V1APIResource',
        class: 'classV1APIResource',
        children: 'V1APIResource'
    },
    {   name: 'Images',
        isDirectory: true,
        path: '/cluster/Image',
        class: 'classImage',
        children: 'Image'
    },
    {   name: 'Component status',
        isDirectory: true,
        path: '/cluster/ComponentStatus',
        class: 'classComponentStatus',
        children: 'ComponentStatus'
    },



    // Workload
    {   name: 'Workload',
        isDirectory: true,
        path: '/workload',
        class: 'classWorkload',
        layout: 'own',
    },
    {   name: 'Overview',
        isDirectory: true,
        path: '/workload/overview',
        class: 'classmenu',
        layout: 'own',
    },
    {   name: 'Pods',
        isDirectory: true,
        path: '/workload/Pod',
        layout: 'list',  
        class: 'classPod',
        categories: [ 'Node', 'Namespace', 'controller' ],
        children: 'Pod'
    },
    {   name: 'Deployments',
        isDirectory: true,
        path: '/workload/Deployment',
        class: 'classDeployment',
        categories: [ 'Namespace' ],
        children: 'Deployment'
    },
    {   name: 'Daemon Sets',
        isDirectory: true,
        path: '/workload/DaemonSet',
        class: 'classDaemonSet',
        categories: [ 'Namespace' ],
        children: 'DaemonSet'
    },
    {   name: 'Replica Sets',
        isDirectory: true,
        path: '/workload/ReplicaSet',
        class: 'classReplicaSet',
        categories: [ 'Namespace' ],
        children: 'ReplicaSet'
    },
    {   name: 'Replication Controllers',
        isDirectory: true,
        path: '/workload/ReplicationController',
        class: 'classReplicationController',
        categories: [ 'Namespace' ],
        children: 'ReplicationController'
    },
    {   name: 'Stateful Sets',
        isDirectory: true,
        path: '/workload/StatefulSet',
        class: 'classStatefulSet',
        categories: [ 'Namespace' ],
        children: 'StatefulSet'
    },
    {   name: 'Jobs',
        isDirectory: true,
        path: '/workload/Job',
        class: 'classJob',
        categories: [ 'Namespace' ],
        children: 'Job'
    },
    {   name: 'Cron jobs',
        isDirectory: true,
        path: '/workload/CronJob',
        class: 'classCronJob',
        categories: [ 'Namespace' ],
        children: 'CronJob'
    },



    //Config
    {   name: 'Config',
        isDirectory: true,
        path: '/config',
        class: 'classConfig',
        layout: 'own',
    },
    {   name: 'Overview',
        isDirectory: true,
        path: '/config/overview',
        class: 'classmenu',
        layout: 'own',   
    },
    {   name: 'Config Maps',
        isDirectory: true,
        path: '/config/ConfigMap',
        class: 'classConfigMap',
        categories: [ 'Namespace' ],
        children: 'ConfigMap'
    },
    {   name: 'Secrets',
        isDirectory: true,
        path: '/config/Secret',
        class: 'classSecret',
        categories: [ 'Namespace' ],
        children: 'Secret'
    },
    {   name: 'Resource Quota',
        isDirectory: true,
        path: '/config/ResourceQuota',
        class: 'classResourceQuota',
        categories: [ 'Namespace' ],
        children: 'ResourceQuota'
    },
    {   name: 'Limit Range',
        isDirectory: true,
        path: '/config/LimitRange',
        class: 'classLimitRange',
        categories: [ 'Namespace' ],
        children: 'LimitRange'
    },
    {   name: 'Horizontal Pod Autoscaler',
        isDirectory: true,
        path: '/config/HorizontalPodAutoscaler',
        class: 'classHorizontalPodAutoscaler',
        categories: [ 'Namespace' ],
        children: 'HorizontalPodAutoscaler'
    },
    {   name: 'Pod Disruption Budget',
        isDirectory: true,
        path: '/config/PodDisruptionBudget',
        class: 'classPodDisruptionBudget',
        categories: [ 'Namespace' ],
        children: 'PodDisruptionBudget'
    },
    {   name: 'Priority Classes',
        isDirectory: true,
        path: '/config/PriorityClass',
        class: 'classPriorityClass',
        children: 'PriorityClass'
    },
    {   name: 'Runtime Classes',
        path: '/config/RuntimeClass',
        isDirectory: true,
        class: 'classRuntimeClass',
        children: 'RuntimeClass'
    },
    {   name: 'Leases',
        isDirectory: true,
        path: '/config/Lease',
        class: 'classLease',
        categories: [ 'Namespace' ],
        children: 'Lease'
    },
    {   name: 'Validating webhooks',
        isDirectory: true,
        path: '/config/ValidatingWebhookConfiguration',
        class: 'classValidatingWebhookConfiguration',
        children: 'ValidatingWebhookConfiguration'
    },
    {   name: 'Mutating webhooks',
        isDirectory: true,
        path: '/config/MutatingWebhookConfiguration',
        class: 'classMutatingWebhookConfiguration',
        children: 'MutatingWebhookConfiguration'
    },


    // Network
    {   name: 'Network',
        isDirectory: true,
        path: '/network',
        class: 'classNetwork',
        layout: 'own',
    },
    {   name: 'Overview',
        isDirectory: true,
        path: '/network/overview',
        class: 'classmenu',
        layout: 'own',   
    },
    {   name: 'Services',
        isDirectory: true,
        path: '/network/Service',
        layout: 'list',  
        class: 'classService',
        categories: [ 'Namespace' ],
        children: 'Service'
    },
    {   name: 'Endpoints\u00a0',
        isDirectory: true,
        path: '/network/Endpoints',
        layout: 'list',  
        class: 'classEndpoints',
        categories: [ 'Namespace' ],
        children: 'Endpoints'
    },
    {   name: 'Ingresses',
        isDirectory: true,
        path: '/network/Ingress',
        layout: 'list',  
        class: 'classIngress',
        categories: [ 'Namespace' ],
        children: 'Ingress'
    },
    {   name: 'Ingress classes',
        isDirectory: true,
        path: '/network/IngressClass',
        layout: 'list',
        class: 'classIngressClass',
        children: 'IngressClass'
    },
    {   name: 'Network policies',
        isDirectory: true,
        path: '/network/NetworkPolicy',
        layout: 'list',
        class: 'classNetworkPolicy',
        categories: [ 'Namespace' ],
        children: 'NetworkPolicy'
    },



    //Storage
    {   name: 'Storage',
        isDirectory: true,
        path: '/storage',
        class: 'classStorage',
        layout: 'own',
    },
    {   name: 'Overview',
        isDirectory: true,
        path: '/storage/overview',
        class: 'classmenu',
        layout: 'own',   
    },
    {   name: 'Persistent volume claims',
        isDirectory: true,
        path: '/storage/PersistentVolumeClaim',
        class: 'classPersistentVolumeClaim',
        categories: [ 'Namespace' ],
        children: 'PersistentVolumeClaim'
    },
    {   name: 'Persistent volumes',
        isDirectory: true,
        path: '/storage/PersistentVolume',
        class: 'classPersistentVolume',
        children: 'PersistentVolume'
    },
    {   name: 'Volume attachments',
        isDirectory: true,
        path: '/storage/VolumeAttachment',
        class: 'classVolumeAttachment',
        children: 'VolumeAttachment'
    },
    {   name: 'Storage classes',
        isDirectory: true,
        path: '/storage/StorageClass',
        class: 'classStorageClass',
        children: 'StorageClass'
    },
    {   name: 'CSI Drivers',
        isDirectory: true,
        path: '/storage/CSIDriver',
        class: 'classCSIDriver',
        children: 'CSIDriver'
    },
    {   name: 'CSI Nodes',
        isDirectory: true,
        path: '/storage/CSINode',
        class: 'classCSINode',
        children: 'CSINode'
    },
    {   name: 'CSI Storage Capacity',
        isDirectory: true,
        path: '/storage/CSIStorageCapacity',
        class: 'classCSIStorageCapacity',
        children: 'CSIStorageCapacity'
    },


    //Access
    {   name: 'Access',
        isDirectory: true,
        path: '/access',
        class: 'classAccess',
        layout: 'own',
    },
    {   name: 'Overview',
        isDirectory: true,
        path: '/access/overview',
        class: 'classmenu',
        layout: 'own',
    },
    {   name: 'Service accounts',
        isDirectory: true,
        path: '/access/ServiceAccount',
        class: 'classServiceAccount',
        categories: [ 'Namespace' ],
        children: 'ServiceAccount'
    },
    {   name: 'Cluster roles',
        isDirectory: true,
        path: '/access/ClusterRole',
        class: 'classClusterRole',
        children: 'ClusterRole'
    },
    {   name: 'Roles',
        isDirectory: true,
        path: '/access/Role',
        class: 'classRole',
        categories: [ 'Namespace' ],
        children: 'Role'
    },
    {   name: 'Cluster role bindings',
        isDirectory: true,
        path: '/access/ClusterRoleBinding',
        class: 'classClusterRoleBinding',
        children: 'ClusterRoleBinding'
    },
    {   name: 'Role bindings',
        isDirectory: true,
        path: '/access/RoleBinding',
        class: 'classRoleBinding',
        categories: [ 'Namespace' ],
        children: 'RoleBinding'
    },

    // CRD
    {   name: 'Custom',
        isDirectory: true,
        path: '/custom',
        class: 'classCustom',
        layout: 'own',
    },
    {   name: 'Definitions',
        isDirectory: true,
        path: '/custom/CustomResourceDefinition',
        class: 'classCustomResourceDefinition',
        children: 'CustomResourceDefinition'
    },

    // Preferences
    {   name: 'Preferences',
        isDirectory: true,
        path: '/preferences',
        class: 'classSettings',
        layout: 'own'
    },
]

// Cluster
spaces.set('classClusterOverview', 
    {
        leftItems: [
            {
                name:'search',
                icon: <Search fontSize='small'/>,
                text: 'Search',
                permission: true
            }
        ]
    }    
)

// Network
spaces.set('classService',
    {
        leftItems: [
            {
                name:'create',
                icon: <Add fontSize='small'/>,
                text: 'New service',
                permission: true
            }
        ]
    }
)
spaces.set('Service',
    {
        text:'Service name',
        source:'name',
        width:20,
        leftItems: [
            {
                name: 'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {
                name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            },
            {
                name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit service',
                permission: true,
            }
        ],
        properties: [
            {
                name: 'namespace',
                text: 'Namespace',
                source: 'namespace',
                format: 'string',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'type',
                text: 'Type',
                source: 'type',
                format: 'string',
                width: 10,
                sortable: true,
                visible: true
            },
            {
                name: 'clusterIp',
                text: 'ClusterIP',
                source: 'clusterIp',
                format: 'string',
                width: 10,
                sortable: false,
                visible: true
            },
            {
                name: 'ports',
                text: 'Ports',
                source: 'ports',
                format: 'string',
                width: 10,
                sortable: false,
                visible: true
            },
            {
                name: 'externalIp',
                text: 'ExternalIP',
                source: 'externalIp',
                format: 'string',
                width: 10,
                sortable: false,
                visible: true
            },
            {
                name: 'selector',
                text: 'Selector',
                source: 'function',
                format: 'string',
                width: 15,
                sortable: false,
                visible: true
            },
            {
                name: 'creationTimestamp',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 10,
                sortable: true,
                visible: true
            }
        ]
    }
)
spaces.set('classEndpoints',
    {
        leftItems: [
            {
                name:'create',
                icon: <Add fontSize='small'/>,
                text: 'Create',
                permission: true,
            }
        ]
    }
)
spaces.set('Endpoints',
    {
        text:'Name',
        source:'name',
        width:30,
        leftItems: [
            {
                name: 'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {
                name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            },
            {
                name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            },
        ],
        properties: [
            {
                name: 'namespace',
                text: 'Namespace',
                source: 'namespace',
                format: 'string',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'endpoints',
                text: 'Endpoints',
                source: 'endpoints',
                format: 'string',
                width: 45,
                sortable: false,
                visible: true
            },
            {
                name: 'creationTimestamp',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 10,
                sortable: true,
                visible: true
            }
        ]
    }
)
spaces.set('classIngress',
    {
        leftItems: [
            {
                name: 'create',
                icon: <Add fontSize='small'/>,
                text: 'New ingress',
                permission: true,
            }
        ]
    }
)
spaces.set('Ingress',
    {
        text:'Name',
        source:'name',
        width:25,
        leftItems: [
            {
                name: 'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {
                name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            },
            {
                name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            },
        ],
        properties: [
            {
                name: 'namespace',
                text: 'Namespace',
                source: 'namespace',
                format: 'string',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'loadBalancers',
                text: 'LoadBalancers',
                source: 'loadBalancers',
                format: 'string',
                width: 10,
                sortable: true,
                visible: true
            },
            {
                name: 'rules',
                text: 'Rules',
                source: 'rules',
                format: 'function',
                width: 40,
                sortable: false,
                visible: true
            },
            {
                name: 'creationTimestamp',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 10,
                sortable: true,
                visible: true
            },
        ]
    }
)
spaces.set('classIngressClass',
    {
        leftItems: [
            {
                name: 'create',
                icon: <Add fontSize='small'/>,
                text: 'Create',
                permission: true,
            }
        ]
    }
)
spaces.set('IngressClass',
    {
        text:'Name',
        source:'name',
        width:50,
        leftItems: [
            {
                name: 'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {
                name: 'default',
                icon: <CheckCircle fontSize='small'/>,
                text: 'Set Default',
                permission: true,
            },
            {
                name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            },
            {
                name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            },
        ],
        properties: [
            {
                name: 'controller',
                text: 'Controller',
                source: 'controller',
                format: 'string',
                width: 40,
                sortable: true,
                visible: true
            },
            {
                name: 'creationTimestamp',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 10,
                sortable: true,
                visible: true
            },
        ]
    }
)
spaces.set('classNetworkPolicy',
    {
        leftItems: [
            {
                name: 'create',
                icon: <Add fontSize='small'/>,
                text: 'Create',
                permission: true,
            }
        ]
    }
)
spaces.set('NetworkPolicy',
    {
        text:'Name',
        source:'name',
        width:40,
        leftItems: [
            {
                name: 'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {
                name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            },
            {
                name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            },
        ],
        properties: [
            {
                name: 'namespace',
                text: 'Namespace',
                source: 'namespace',
                format: 'string',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'policyTypes',
                text: 'Policy Types',
                source: 'policyTypes',
                format: 'string',
                width: 15,
                sortable: false,
                visible: true
            },
            {
                name: 'creationTimestamp',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 10,
                sortable: true,
                visible: true
            },
        ]
    }
)

// Config
spaces.set('classConfigMap',
    {
        leftItems: [
            {
                name: 'create',
                icon: <Add fontSize='small'/>,
                text: 'Create',
                permission: true
            }
        ]
    }
)

spaces.set('ConfigMap',
    {
        text:'Config Map name',
        source:'name',
        width:35,
        leftItems: [
            {
                name:'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {
                name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            },
            {
                name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            }
        ],
        properties: [
            {
                name: 'namespace',
                text: 'Namespace',
                source: 'namespace',
                format: 'string',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'keys',
                text: 'Keys',
                source: 'keys',
                format: 'string',
                width: 40,
                sortable: false,
                visible: true
            },
            {
                name: 'creationTimestamp',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 10,
                sortable: true,
                visible: true
            }
        ]
    }
)
spaces.set('classSecret',
    {
        leftItems: [
            {
                name: 'create',
                icon: <Add fontSize='small'/>,
                text: 'Create',
                permission: true
            }
        ]
    }
)
spaces.set('Secret',
    {
        text:'Secret name',
        source:'name',
        width:40,
        leftItems: [
            {
                name:'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {
                name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            },
            {
                name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            }
        ],
        properties: [
            {
                name: 'namespace',
                text: 'Namespace',
                source: 'namespace',
                format: 'string',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'type',
                text: 'Type',
                source: 'type',
                format: 'string',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'keys',
                text: 'Keys',
                source: 'keys',
                format: 'string',
                width: 15,
                sortable: false,
                visible: true
            },
            {
                name: 'creationTimestamp',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 15,
                sortable: true,
                visible: true
            }
        ]
    }
)
spaces.set('classResourceQuota',
    {
        leftItems: [
            {
                name: 'create',
                icon: <Add fontSize='small'/>,
                text: 'Create',
                permission: true
            }
        ]
    }
)
spaces.set('ResourceQuota',
    {
        text:'Quota name',
        source:'name',
        width:40,
        leftItems: [
            {
                name:'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {
                name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            },
            {
                name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            }
        ],
        properties: [
            {
                name: 'namespace',
                text: 'Namespace',
                source: 'namespace',
                format: 'string',
                width: 40,
                sortable: true,
                visible: true
            },
            {
                name: 'creationTimestamp',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 20,
                sortable: true,
                visible: true
            }
        ]
    }
)
spaces.set('classLimitRange',
    {
        leftItems: [
            {
                name: 'create',
                icon: <Add fontSize='small'/>,
                text: 'Create',
                permission: true
            }
        ]
    }
)
spaces.set('LimitRange',
    {
        text:'Limit name',
        source:'name',
        width:40,
        leftItems: [
            {
                name:'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {
                name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            },
            {
                name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            }
        ],
        properties: [
            {
                name: 'namespace',
                text: 'Namespace',
                source: 'namespace',
                format: 'string',
                width: 40,
                sortable: true,
                visible: true
            },
            {
                name: 'creationTimestamp',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 20,
                sortable: true,
                visible: true
            }
        ]
    }
)
spaces.set('classHorizontalPodAutoscaler',
    {
        leftItems: [
            {
                name: 'create',
                icon: <Add fontSize='small'/>,
                text: 'Create',
                permission: true
            }
        ]
    }
)
spaces.set('HorizontalPodAutoscaler',
    {
        text:'HPA name',
        source:'name',
        width:35,
        leftItems: [
            {
                name:'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {
                name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            },
            {
                name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            }
        ],
        properties: [
            {
                name: 'namespace',
                text: 'Namespace',
                source: 'namespace',
                format: 'string',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'metrics',
                text: 'Metrics',
                source: 'metrics',
                format: 'string',
                width: 8,
                sortable: true,
                visible: true
            },
            {
                name: 'minpods',
                text: 'Min Pods',
                source: 'minpods',
                format: 'string',
                width: 8,
                sortable: true,
                visible: true
            },
            {
                name: 'maxpods',
                text: 'Max Pods',
                source: 'maxpods',
                format: 'string',
                width: 8,
                sortable: true,
                visible: true
            },
            {
                name: 'replicas',
                text: 'Replicas',
                source: 'replicas',
                format: 'string',
                width: 8,
                sortable: true,
                visible: true
            },
            {
                name: 'status',
                text: 'Status',
                source: 'status',
                format: 'string',
                width: 8,
                sortable: true,
                visible: true
            },
            {
                name: 'creationTimestamp',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 10,
                sortable: true,
                visible: true
            }
        ]
    }
)
spaces.set('classPodDisruptionBudget',
    {
        leftItems: [
            {
                name: 'create',
                icon: <Add fontSize='small'/>,
                text: 'Create',
                permission: true
            }
        ]
    }
)
spaces.set('PodDisruptionBudget',
    {
        text:'Name',
        source:'name',
        width:30,
        leftItems: [
            {
                name:'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {
                name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            },
            {
                name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            }
        ],
        properties: [
            {
                name: 'namespace',
                text: 'Namespace',
                source: 'namespace',
                format: 'string',
                width: 20,
                sortable: true,
                visible: true
            },
            {
                name: 'minAvailable',
                text: 'Min available',
                source: 'minAvailable',
                format: 'string',
                width: 10,
                sortable: true,
                visible: true
            },
            {
                name: 'maxUnavailable',
                text: 'Max unavailable',
                source: 'maxUnavailable',
                format: 'string',
                width: 10,
                sortable: true,
                visible: true
            },
            {
                name: 'currentHealthy',
                text: 'Current Healthy',
                source: 'currentHealthy',
                format: 'string',
                width: 10,
                sortable: true,
                visible: true
            },
            {
                name: 'desiredHealthy',
                text: 'Desired Healthy',
                source: 'desiredHealthy',
                format: 'string',
                width: 10,
                sortable: true,
                visible: true
            },
            {
                name: 'creationTimestamp',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 10,
                sortable: true,
                visible: true
            }
        ]
    }
)
spaces.set('classPriorityClass',
    {
        leftItems: [
            {
                name: 'create',
                icon: <Add fontSize='small'/>,
                text: 'Create',
                permission: true
            }
        ]
    }
)
spaces.set('PriorityClass',
    {
        text:'Name',
        source:'name',
        width:40,
        leftItems: [
            {
                name:'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {
                name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            },
            {
                name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            }
        ],
        properties: [
            {
                name: 'value',
                text: 'Value',
                source: 'value',
                format: 'string',
                width: 40,
                sortable: true,
                visible: true
            },
            {
                name: 'globalDefault',
                text: 'Global default',
                source: 'globalDefault',
                format: 'string',
                width: 40,
                sortable: true,
                visible: true
            },
            {
                name: 'creationTimestamp',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 20,
                sortable: true,
                visible: true
            }
        ]
    }
)
spaces.set('classRuntimeClass',
    {
        leftItems: [
            {
                name: 'create',
                icon: <Add fontSize='small'/>,
                text: 'Create',
                permission: true
            }
        ]
    }
)
spaces.set('RuntimeClass',
    {
        text:'Name',
        source:'name',
        width:40,
        leftItems: [
            {
                name:'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {
                name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            },
            {
                name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            }
        ],
        properties: [
            {
                name: 'handler',
                text: 'Handler',
                source: 'handler',
                format: 'string',
                width: 40,
                sortable: true,
                visible: true
            },
            {
                name: 'creationTimestamp',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 20,
                sortable: true,
                visible: true
            }
        ]
    }
)
spaces.set('classLease',
    {
        leftItems: [
        ]
    }
)
spaces.set('Lease',
    {
        text: 'Name',
        source: 'name',
        width: 30,
        leftItems: [
            {
                name:'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {
                name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            },
            {
                name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            }
        ],
        properties: [
            {
                name: 'namespace',
                text: 'Namespace',
                source: 'namespace',
                format: 'string',
                width: 20,
                sortable: true,
                visible: true
            },
            {
                name: 'holder',
                text: 'Holder',
                source: 'holder',
                format: 'string',
                width: 40,
                sortable: true,
                visible: true
            },
            {
                name: 'creationTimestamp',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 10,
                sortable: true,
                visible: true
            }
        ]
    }
)
spaces.set('classValidatingWebhookConfiguration',
    {
        leftItems: [
            {
                name: 'create',
                icon: <Add fontSize='small'/>,
                text: 'Create',
                permission: true
            }
        ]
    }
)
spaces.set('ValidatingWebhookConfiguration',
    {
        text:'Name',
        source:'name',
        width:40,
        leftItems: [
            {
                name:'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {
                name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            },
            {
                name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            }
        ],
        properties: [
            {
                name: 'webhooks',
                text: 'Webhooks',
                source: 'webhooks',
                format: 'string',
                width: 40,
                sortable: true,
                visible: true
            },
            {
                name: 'creationTimestamp',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 20,
                sortable: true,
                visible: true
            }
        ]
    }
)
spaces.set('classMutatingWebhookConfiguration',
    {
        leftItems: [
            {
                name: 'create',
                icon: <Add fontSize='small'/>,
                text: 'Create',
                permission: true
            }
        ]
    }
)
spaces.set('MutatingWebhookConfiguration',
    {
        text:'Name',
        source:'name',
        width:40,
        leftItems: [
            {
                name:'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {
                name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            },
            {
                name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            }
        ],
        properties: [
            {
                name: 'webhooks',
                text: 'Webhooks',
                source: 'webhooks',
                format: 'string',
                width: 40,
                sortable: true,
                visible: true
            },
            {
                name: 'creationTimestamp',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 20,
                sortable: true,
                visible: true
            }
        ]
    }
)

// Cluster
spaces.set('classNamespace',
    {
        leftItems: [
            {
                name:'create',
                icon: <Add fontSize='small'/>,
                text: 'New namespace',
                permission: true,
            }
        ]
    }
)
spaces.set('Namespace',
    {
        text:'Name',
        source:'name',
        width:40,
        leftItems: [
            {
                name: 'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {
                name: 'search',
                icon: <Search fontSize='small'/>,
                text: 'Search',
                permission: true,
            },
            {   name: 'log',
                icon: <Subject fontSize='small'/>,
                text: 'Logs',
                multi: true,
                permission: true,
            },
            {
                name:'metrics',
                icon: <BarChart fontSize='small'/>,
                text: 'Metrics',
                multi: true,
                permission: true
            },
            {
                name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            },
            {
                name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            },
        ],
        properties: [
            {
                name: 'labels',
                text: 'Labels',
                source: 'labels',
                format: 'string',
                width: 30,
                sortable: false,
                visible: true
            },
            {
                name: 'creationTimestamp',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'status',
                text: 'Status',
                source: 'status',
                format: 'string',
                width: 15,
                sortable: true,
                visible: true
            }
        ]
    }
)
spaces.set('Node',
    {
        text: 'Name',
        source: 'name',
        width: 30,
        configurable: false,
        leftItems: [
            {
                name:'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {
                name: 'cordon',
                icon: <PauseCircle fontSize='small' />,
                text: 'Cordon',
                multi: true,
                permission: true,
            },
            {
                name: 'uncordon',
                icon: <PlayCircle fontSize='small' />,
                text: 'UnCordon',
                multi: true,
                permission: true,
            },
            {
                name: 'drain',
                icon: <StopCircle fontSize='small' />,
                text: 'Drain',
                multi: true,
                permission: true,
            },
            {
                name:'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            },
            {
                name:'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            },
        ],
        properties: [
            {
                name: 'cpu',
                text: 'CPU',
                source: 'cpu',
                format: 'string',
                width: 6,
                removable: false,
                sortable: true,
                visible: true
            },
            {
                name: 'memory',
                text: 'Memory',
                source: 'memory',
                format: 'string',
                width: 10,
                removable: false,
                sortable: true,
                visible: true
            },
            {
                name: 'taints',
                text: 'Taints',
                source: 'taints',
                format: 'string',
                width: 6,
                removable: false,
                sortable: true,
                visible: true
            },
            {
                name: 'roles',
                text: 'Roles',
                source: 'roles',
                format: 'string',
                width: 20,
                removable: false,
                sortable: false,
                visible: true
            },
            {
                name: 'version',
                text: 'Version',
                source: 'version',
                format: 'string',
                width: 10,
                removable: false,
                sortable: true,
                visible: true
            },
            {
                name: 'conditions',
                text: 'Conditions',
                source: 'conditions',
                format: 'string',
                width: 10,
                removable: false,
                sortable: true,
                visible: true
            },
            {
                name: 'age',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 8,
                sortable: true,
                visible: true
            },
        ]
    }
)

spaces.set('classImage',
    {
        leftItems: [
        ]
    }
)

spaces.set('Image',
    {
        text: 'Name',
        source: 'name',
        width: 80,
        leftItems: [
            {
                name:'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {
                name:'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            },
        ],
        properties: [
            {
                name: 'tag',
                text: 'Tag',
                source: 'tag',
                format: 'string',
                width: 10,
                sortable: true,
                visible: true
            },
            {
                name: 'size',
                text: 'Size',
                source: 'size',
                format: 'storage',
                width: 10,
                sortable: true,
                visible: true
            },
        ]
    }
)

spaces.set('classV1APIResource',
    {
        leftItems: [
        ]
    }
)
spaces.set('V1APIResource',
    {
        text:'Name',
        source:'name',
        width:30,
        leftItems: [
            {
                name:'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {
                name:'browse',
                icon: <EditOff fontSize='small'/>,
                text: 'Browse',
                multi: false,
                permission: true,
            },
        ],
        properties: [
            {
                name: 'kindName',
                text: 'Kind',
                source: 'kind',
                format: 'string',
                width: 30,
                sortable: true,
                visible: true
            },
            {
                name: 'singularName',
                text: 'Singular',
                source: 'singular',
                format: 'string',
                width: 30,
                sortable: true,
                visible: true
            },
            {
                name: 'namespaced',
                text: 'Namespaced',
                source: 'namespaced',
                format: 'string',
                width: 10,
                sortable: true,
                visible: true
            },
        ]
    }
)
spaces.set('classComponentStatus',
    {
        leftItems: [
        ]
    }
)
spaces.set('ComponentStatus',
    {
        text:'Name',
        source:'name',
        width:30,
        leftItems: [
            {
                name: 'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {
                name:'browse',
                icon: <EditOff fontSize='small'/>,
                text: 'Browse',
                permission: true,
            },
        ],
        properties: [
            {
                name: 'status',
                text: 'Status',
                source: 'status',
                format: 'string',
                width: 20,
                sortable: true,
                visible: true
            },
            {
                name: 'message',
                text: 'Message',
                source: 'message',
                format: 'string',
                width: 50,
                sortable: true,
                visible: true
            },
        ]
    }
)

// Workload
spaces.set('classPod',
    {
        leftItems: [
            {
                name: 'create',
                icon: <Add fontSize='small'/>,
                text: 'New pod',
                permission: true,
            }
        ]
    }
)
spaces.set('Pod',
    {
        text:'Name',
        source:'name',
        width:25,
        leftItems: [
            {
                name:'details',
                text: 'Pod details',
                icon: <Info fontSize='small'/>,
                permission: true,
            },
            {
                name: 'ops',
                icon: <Terminal fontSize='small'/>,
                text: 'Shell',
                permission: true
            },
            {
                name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true
            },
            {
                name:'log',
                icon: <Subject fontSize='small'/>,
                text: 'Logs',
                multi: true,
                permission: true,
            },
            {
                name:'metrics',
                icon: <BarChart fontSize='small'/>,
                text: 'Metrics',
                multi: true,
                permission: true
            },
            {
                name:'fileman',
                icon: <FolderCopy fontSize='small'/>,
                text: 'Fileman',
                multi: true,
                permission: true
            },
            {
                name:'trivy',
                icon: <VerifiedUser fontSize='small'/>,
                text: 'Trivy',
                multi: true,
                permission: true
            },
            {
                name:'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            },
            {
                name: 'evict',
                icon: <DeleteSweep fontSize='small'/>,
                text: 'Evict',
                multi: true,
                permission: true
            }
        ],
        properties: [
            {
                name: 'namespace',
                text: 'Namespace',
                source: 'namespace',
                format: 'string',
                width: 10,
                sortable: true,
                visible: true
            },
            {
                name: 'container',
                text: 'Container',
                source: 'na',
                format: 'function',
                sortable: false,
                width: 10,
                visible: true
            },
            {
                name: 'cpu',
                text: 'CPU',
                source: 'cpu',
                format: 'string',
                width: 10,
                sortable: true,
                visible: true
            },
            {
                name: 'memory',
                text: 'Memory',
                source: 'memory',
                format: 'storage',
                width: 10,
                sortable: true,
                visible: true
            },
            {
                name: 'restarts',
                text: 'Restarts',
                source: 'restartCount',
                format: 'number',
                width: 5,
                sortable: true,
                visible: true
            },
            {
                name: 'controller',
                text: 'Controller',
                source: 'controller',
                format: 'string',
                width: 10,
                sortable: true,
                visible: true
            },
            {
                name: 'node',
                text: 'Node',
                source: 'node',
                format: 'string',
                width: 10,
                sortable: true,
                visible: true
            },
            {
                name: 'age',
                text: 'Age',
                source: 'startTime',
                format: 'age',
                width: 5,
                sortable: true,
                visible: true
            },
            {
                name: 'status',
                text: 'Status',
                source: 'function',
                format: 'string',
                width: 5,
                sortable: false,
                visible: true
            }
        ]
    }
)
spaces.set('classDeployment',
    {
        leftItems: [
            {
                name: 'create',
                icon: <Add fontSize='small'/>,
                text: 'Create',
                permission: true,
            }
        ]
    }
)
spaces.set('Deployment',
    {
        text:'Name',
        source:'name',
        width:30,
        leftItems: [
            {   name: 'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {   name: 'log',
                icon: <Subject fontSize='small'/>,
                text: 'Logs',
                multi: true,
                permission: true,
            },
            {
                name:'metrics',
                icon: <BarChart fontSize='small'/>,
                text: 'Metrics',
                multi: true,
                permission: true
            },
            {   name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            },
            {   name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            },
            {   name: 'scale',
                icon: <Iso fontSize='small'/>,
                text: 'Scale',
                permission: true,
            },
            {   name: 'restart',
                icon: <RestartAlt fontSize='small'/>,
                text: 'Restart',
                permission: true,
            },
        ],
        properties: [
            {
                name: 'namespace',
                text: 'Namespace',
                source: 'namespace',
                format: 'string',
                width: 20,
                sortable: true,
                visible: true
            },
            {
                name: 'pods',
                text: 'Pods',
                source: 'pods',
                format: 'string',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'replicas',
                text: 'Replicas',
                source: 'replicas',
                format: 'number',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'status',
                text: 'Status',
                source: 'status',
                format: 'function',
                width: 10,
                sortable: false,
                visible: true
            },
            {
                name: 'age',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 10,
                sortable: true,
                visible: true
            }
        ]
    }
)
spaces.set('classDaemonSet',
    {
        leftItems: [
            {
                name: 'create',
                icon: <Add fontSize='small'/>,
                text: 'Create',
                permission: true,
            }
        ],
    }
)
spaces.set('DaemonSet',
    {
        text:'Name',
        source:'name',
        width:25,
        leftItems: [
            {   name: 'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {   name: 'restart',
                icon: <RestartAlt fontSize='small'/>,
                text: 'Restart',
                permission: true,
            },
            {   name: 'log',
                icon: <Subject fontSize='small'/>,
                text: 'Logs',
                permission: true,
            },
            {
                name:'metrics',
                icon: <BarChart fontSize='small'/>,
                text: 'Metrics',
                multi: true,
                permission: true
            },
            {   name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            },
            {   name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            },
        ],
        properties: [
            {
                name: 'namespace',
                text: 'Namespace',
                source: 'namespace',
                format: 'string',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'desired',
                text: 'Desired',
                source: 'desired',
                format: 'number',
                width: 8,
                sortable: true,
                visible: true
            },
            {
                name: 'current',
                text: 'Current',
                source: 'current',
                format: 'number',
                width: 8,
                sortable: true,
                visible: true
            },
            {
                name: 'ready',
                text: 'Ready',
                source: 'ready',
                format: 'number',
                width: 8,
                sortable: true,
                visible: true
            },
            {
                name: 'upToDate',
                text: 'Up-to-Date',
                source: 'upToDate',
                format: 'number',
                width: 8,
                sortable: true,
                visible: true
            },
            {
                name: 'available',
                text: 'Available',
                source: 'available',
                format: 'number',
                width: 8,
                sortable: true,
                visible: true
            },
            {
                name: 'nodeSelector',
                text: 'Node Selector',
                source: 'nodeSelector',
                format: 'string',
                width: 10,
                sortable: false,
                visible: true
            },
            {
                name: 'age',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 10,
                sortable: true,
                visible: true
            },
        ]
    }
)
spaces.set('classReplicaSet',
    {
        leftItems: [
            {
                name: 'create',
                icon: <Add fontSize='small'/>,
                text: 'Create',
                permission: true,
            }
        ]
    }
)
spaces.set('ReplicaSet',
    {
        text:'Name',
        source:'name',
        width:30,
        leftItems: [
            {   name: 'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {   name: 'scale',
                icon: <Iso fontSize='small'/>,
                text: 'Scale',
                permission: true,
            },
            {   name: 'log',
                icon: <Subject fontSize='small'/>,
                text: 'Logs',
                permission: true,
            },
            {   name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            },
            {   name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            },
        ],
        properties: [
            {
                name: 'namespace',
                text: 'Namespace',
                source: 'namespace',
                format: 'string',
                width: 20,
                sortable: true,
                visible: true
            },
            {
                name: 'desired',
                text: 'Desired',
                source: 'desired',
                format: 'number',
                width: 10,
                sortable: true,
                visible: true
            },
            {
                name: 'current',
                text: 'Current',
                source: 'current',
                format: 'number',
                width: 10,
                sortable: true,
                visible: true
            },
            {
                name: 'ready',
                text: 'Ready',
                source: 'ready',
                format: 'number',
                width: 10,
                sortable: true,
                visible: true
            },
            {
                name: 'age',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 20,
                sortable: true,
                visible: true
            },
        ]
    }
)
spaces.set('classReplicationController',
    {
        leftItems: [
            {
                name: 'create',
                icon: <Add fontSize='small'/>,
                text: 'Create',
                permission: true,
            }
        ]
    }
)
spaces.set('ReplicationController',
    {
        text: 'Name',
        source: 'name',
        width: 60,
        leftItems: [
            {   name: 'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {   name: 'restart',
                icon: <RestartAlt fontSize='small'/>,
                text: 'Restart',
                permission: true,
            },
            {   name: 'scale',
                icon: <Iso fontSize='small'/>,
                text: 'Scale',
                permission: true,
            },
            {   name: 'log',
                icon: <Subject fontSize='small'/>,
                text: 'Logs',
                permission: true,
            },
            {   name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            },
            {   name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            },
        ],
        properties: [
            {
                name: 'namespace',
                text: 'Namespace',
                source: 'namespace',
                format: 'string',
                width: 20,
                sortable: true,
                visible: true
            },
            {
                name: 'replicas',
                text: 'Replicas',
                source: 'replicas',
                format: 'number',
                width: 10,
                sortable: true,
                visible: true
            },
            {
                name: 'desired',
                text: 'Desired',
                source: 'desired',
                format: 'number',
                width: 10,
                sortable: true,
                visible: true
            }
        ]
    }
)
spaces.set('classStatefulSet',
    {
        leftItems: [
            {
                name: 'create',
                icon: <Add fontSize='small'/>,
                text: 'Create',
                permission: true,
            }
        ]
    }
)
spaces.set('StatefulSet',
    {
        text:'Name',
        source:'name',
        width:35,
        leftItems: [
            {   name: 'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {   name: 'scale',
                icon: <Iso fontSize='small'/>,
                text: 'Scale',
                permission: true,
            },
            {   name: 'restart',
                icon: <RestartAlt fontSize='small'/>,
                text: 'Restart',
                permission: true,
            },
            {   name: 'log',
                icon: <Subject fontSize='small'/>,
                text: 'Logs',
                permission: true,
            },
            {   name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            },
            {   name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            },
        ],
        properties: [
            {
                name: 'namespace',
                text: 'Namespace',
                source: 'namespace',
                format: 'string',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'pods',
                text: 'Pods',
                source: 'pods',
                format: 'string',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'replicas',
                text: 'Replicas',
                source: 'replicas',
                format: 'number',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'age',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 20,
                sortable: true,
                visible: true
            },
        ]
    }
)
spaces.set('classJob',
    {
        leftItems: [
            {
                name: 'create',
                icon: <Add fontSize='small'/>,
                text: 'Create',
                permission: true,
            }
        ]
    }
)
spaces.set('Job',
    {
        text:'Name',
        source:'name',
        width:35,
        leftItems: [
            {   name: 'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {   name: 'log',
                icon: <Subject fontSize='small'/>,
                text: 'Logs',
                permission: true,
            },
            {   name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            },
            {   name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            },
        ],
        properties: [
            {
                name: 'namespace',
                text: 'Namespace',
                source: 'namespace',
                format: 'string',
                width: 25,
                sortable: true,
                visible: true
            },
            {
                name: 'completions',
                text: 'Completions',
                source: 'completions',
                format: 'string',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'conditions',
                text: 'Conditions',
                source: 'conditions',
                format: 'function',
                width: 15,
                sortable: false,
                visible: true
            },
            {
                name: 'age',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 10,
                sortable: true,
                visible: true
            },
        ]
    }
)
spaces.set('classCronJob',
    {
        leftItems: [
            {
                name: 'create',
                icon: <Add fontSize='small'/>,
                text: 'Create',
                permission: true,
            }
        ]
    }
)
spaces.set('CronJob',
    {
        text:'Name',
        source:'name',
        width:30,
        leftItems: [
            {   name: 'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {   name: 'trigger',
                icon: <PlayCircle fontSize='small'/>,
                text: 'Trigger',
                permission: true,
            },
            {   name: 'suspend',
                icon: <PauseCircleOutline fontSize='small'/>,
                text: 'Suspend',
                permission: true,
            },
            {   name: 'resume',
                icon: <PlayCircleOutline fontSize='small'/>,
                text: 'Resume',
                permission: true,
            },
            {   name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            },
            {   name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            },
        ],
        properties: [
            {
                name: 'namespace',
                text: 'Namespace',
                source: 'namespace',
                format: 'string',
                width: 10,
                sortable: true,
                visible: true
            },
            {
                name: 'schedule',
                text: 'Schedule',
                source: 'schedule',
                format: 'string',
                width: 10,
                sortable: false,
                visible: true
            },
            {
                name: 'suspend',
                text: 'Suspend',
                source: 'suspend',
                format: 'string',
                width: 5,
                sortable: true,
                visible: true
            },
            {
                name: 'active',
                text: 'Active',
                source: 'active',
                format: 'function',
                width: 5,
                sortable: true,
                visible: true
            },
            {
                name: 'lastSchedule',
                text: 'Last schedule',
                source: 'lastSchedule',
                format: 'age',
                width: 10,
                sortable: true,
                visible: true
            },
            {
                name: 'nextExecution',
                text: 'Next execution',
                source: 'nextExecution',
                format: 'function',
                width: 10,
                sortable: true,
                visible: true
            },
            {
                name: 'timeZone',
                text: 'Time zone',
                source: 'timezone',
                format: 'string',
                width: 10,
                sortable: true,
                visible: true
            },
            {
                name: 'age',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 10,
                sortable: true,
                visible: true
            },
        ]
    }
)

// Storage
spaces.set('classPersistentVolumeClaim',
    {
        leftItems: [
            {
                name: 'create',
                icon: <Add fontSize='small'/>,
                text: 'New PVC',
                permission: true,
            }
        ]
    }
)
spaces.set('PersistentVolumeClaim',
    {
        text:'Name',
        source:'name',
        width:30,
        leftItems: [
            {   name: 'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {   name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            },
            {   name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            }
        ],
        properties: [
            {
                name: 'namespace',
                text: 'Namespace',
                source: 'namespace',
                format: 'string',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'storageClass',
                text: 'Storage class',
                source: 'storageClass',
                format: 'string',
                width: 10,
                sortable: true,
                visible: true
            },
            {
                name: 'size',
                text: 'Size',
                source: 'size',
                format: 'storage',
                width: 5,
                sortable: true,
                visible: true
            },
            {
                name: 'pods',
                text: 'Pods',
                source: 'pods',
                format: 'string',
                width: 20,
                sortable: true,
                visible: true
            },
            {
                name: 'status',
                text: 'Status',
                source: 'status',
                format: 'string',
                width: 10,
                sortable: true,
                visible: true
            },
            {
                name: 'creationTimestamp',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 10,
                sortable: true,
                visible: true
            },
        ]
    }
)
spaces.set('classPersistentVolume',
    {
        leftItems: [
            {
                name: 'create',
                icon: <Add fontSize='small'/>,
                text: 'New PV',
                permission: true,
            }
        ]
    }
)
spaces.set('PersistentVolume',
    {
        text: 'Name',
        source: 'name',
        width: 50,
        leftItems: [
            {   name: 'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {   name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            },
            {   name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            },
        ],
        properties: [
            {
                name: 'storageClass',
                text: 'Storage class',
                source: 'storageClass',
                format: 'string',
                width: 10,
                sortable: true,
                visible: true
            },
            {
                name: 'capacity',
                text: 'Capacity',
                source: 'capacity',
                format: 'storage',
                width: 10,
                sortable: true,
                visible: true
            },
            {
                name: 'clain',
                text: 'Claim',
                source: 'claim',
                format: 'string',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'status',
                text: 'Status',
                source: 'status',
                format: 'string',
                width: 5,
                sortable: true,
                visible: true
            },
            {
                name: 'creationTimestamp',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 10,
                sortable: true,
                visible: true
            },
        ]
    }
)
spaces.set('classVolumeAttachment',
    {
        leftItems: [
        ]
    }
)
spaces.set('VolumeAttachment',
    {
        text:'Name',
        source:'name',
        width: 35,
        leftItems: [
            {   name: 'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {
                name:'browse',
                icon: <EditOff fontSize='small'/>,
                text: 'Browse',
                permission: true,
            },
        ],
        properties: [
            {
                name: 'attacher',
                text: 'Attacher',
                source: 'attacher',
                format: 'string',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'nodeName',
                text: 'Node name',
                source: 'nodeName',
                format: 'string',
                width: 20,
                sortable: true,
                visible: true
            },
            {
                name: 'source',
                text: 'Source',
                source: 'source',
                format: 'string',
                width: 20,
                sortable: true,
                visible: true
            },
            {
                name: 'status',
                text: 'Status',
                source: 'status',
                format: 'string',
                width: 5,
                sortable: true,
                visible: true
            },
            {
                name: 'creationTimestamp',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 5,
                sortable: true,
                visible: true
            }
        ]
    }
)
spaces.set('classStorageClass',
    {
        leftItems: [
            {
                name: 'create',
                icon: <Add fontSize='small'/>,
                text: 'New storage class',
                permission: true,
            }
        ]
    }
)
spaces.set('StorageClass',
    {
        text:'Name',
        source:'name',
        width:40,
        leftItems: [
            {   name: 'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {   name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            },
            {   name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            }
        ],
        properties: [
            {
                name: 'provisioner',
                text: 'Provisioner',
                source: 'provisioner',
                format: 'string',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'reclaimPolicy',
                text: 'Reclaim policy',
                source: 'reclaimPolicy',
                format: 'string',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'default',
                text: 'Default',
                source: 'default',
                format: 'string',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'creationTimestamp',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 10,
                sortable: true,
                visible: true
            }
        ]
    }
)
spaces.set('classCSIDriver',
    {
        leftItems: [
        ]
    }
)
spaces.set('CSIDriver',
    {
        text:'Name',
        source:'name',
        width:40,
        leftItems: [
            {   name: 'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {
                name:'browse',
                icon: <EditOff fontSize='small'/>,
                text: 'Browse',
                permission: true,
            },
        ],
        properties: [
            {
                name: 'attachRequired',
                text: 'Attach Required',
                source: 'attachRequired',
                format: 'string',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'storageCapacity',
                text: 'Storage Capacity',
                source: 'storageCapacity',
                format: 'string',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'creationTimestamp',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 10,
                sortable: true,
                visible: true
            }
        ]
    }
)
spaces.set('classCSINode',
    {
        leftItems: [
        ]
    }
)
spaces.set('CSINode',
    {
        text:'Name',
        source:'name',
        width: 35,
        leftItems: [
            {   name: 'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {
                name:'browse',
                icon: <EditOff fontSize='small'/>,
                text: 'Browse',
                permission: true,
            },
        ],
        properties: [
            {
                name: 'divers',
                text: 'Drivers',
                source: 'drivers',
                format: 'string',
                width: 55,
                sortable: true,
                visible: true
            },
            {
                name: 'creationTimestamp',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 10,
                sortable: true,
                visible: true
            }
        ]
    }
)
spaces.set('classStorageCapacity',
    {
        leftItems: [
        ]
    }
)
spaces.set('CSIStorageCapacity',
    {
        text:'Name',
        source:'name',
        width:40,
        leftItems: [
            {   name: 'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {
                name:'browse',
                icon: <EditOff fontSize='small'/>,
                text: 'Browse',
                permission: true,
            },
        ],
        properties: [
            {
                name: 'creationTimestamp',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 10,
                sortable: true,
                visible: true
            }
        ]
    }
)


// Access
spaces.set('classServiceAccount',
    {
        leftItems: [
            {
                name: 'create',
                icon: <Add fontSize='small'/>,
                text: 'Create',
                permission: true,
            }
        ]
    }
)
spaces.set('ServiceAccount',
    {
        text:'Name',
        source:'name',
        width:40,
        leftItems: [
            {   name: 'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {   name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            },
            {   name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            }
        ],
        properties: [
            {
                name: 'namespace',
                text: 'Namespace',
                source: 'namespace',
                format: 'string',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'creationTimestamp',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 10,
                sortable: true,
                visible: true
            }
        ]
    }
)
spaces.set('classClusterRole',
    {
        leftItems: [
            {
                name: 'create',
                icon: <Add fontSize='small'/>,
                text: 'Create',
                permission: true,
            }
        ]
    }
)
spaces.set('ClusterRole',
    {
        text:'Name',
        source:'name',
        width:40,
        leftItems: [
            {   name: 'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {   name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            },
            {   name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            }
        ],
        properties: [
            {
                name: 'creationTimestamp',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 10,
                sortable: true,
                visible: true
            }
        ]
    }
)
spaces.set('classRole',
    {
        leftItems: [
            {
                name: 'create',
                icon: <Add fontSize='small'/>,
                text: 'Create',
                permission: true,
            }
        ]
    }
)
spaces.set('Role',
    {
        text:'Name',
        source:'name',
        width:40,
        leftItems: [
            {   name: 'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {   name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            },
            {   name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            }
        ],
        properties: [
            {
                name: 'namespace',
                text: 'Namespace',
                source: 'namespace',
                format: 'string',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'creationTimestamp',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 10,
                sortable: true,
                visible: true
            }
        ]
    }
)
spaces.set('classClusterRoleBinding',
    {
        leftItems: [
            {
                name: 'create',
                icon: <Add fontSize='small'/>,
                text: 'Create',
                permission: true,
            }
        ]
    }
)
spaces.set('ClusterRoleBinding',
    {
        text:'Name',
        source:'name',
        width:40,
        leftItems: [
            {   name: 'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {   name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            },
            {   name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            }
        ],
        properties: [
            {
                name: 'bindings',
                text: 'Bindings',
                source: 'bindings',
                format: 'string',
                width: 50,
                sortable: false,
                visible: true
            },
            {
                name: 'creationTimestamp',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 10,
                sortable: true,
                visible: true
            }
        ]
    }
)
spaces.set('classRoleBinding',
    {
        leftItems: [
            {
                name: 'create',
                icon: <Add fontSize='small'/>,
                text: 'Create',
                permission: true,
            }
        ]
    }
)
spaces.set('RoleBinding',
    {
        text:'Name',
        source:'name',
        width:40,
        leftItems: [
            {   name: 'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {   name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            },
            {   name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            }
        ],
        properties: [
            {
                name: 'namespace',
                text: 'Namespace',
                source: 'namespace',
                format: 'string',
                width: 20,
                sortable: true,
                visible: true
            },
            {
                name: 'bindings',
                text: 'Bindings',
                source: 'bindings',
                format: 'string',
                width: 30,
                sortable: false,
                visible: true
            },
            {
                name: 'creationTimestamp',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 10,
                sortable: true,
                visible: true
            }
        ]
    }
)

// Custom
spaces.set('classCustomResourceDefinition',
    {
        leftItems: [
            {
                name: 'create',
                icon: <Add fontSize='small'/>,
                text: 'Create',
                permission: true,
            }
        ]
    }
)
spaces.set('CustomResourceDefinition',
    {
        text:'Name',
        source:'name',
        width:40,
        leftItems: [
            {   name: 'instantiate',
                icon: <Add fontSize='small'/>,
                text: 'Instantiate',
                permission: true,
            },
            {   name: 'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {   name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            },
            {   name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            }
        ],
        properties: [
            {
                name: 'group',
                text: 'Group',
                source: 'group',
                format: 'string',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'version',
                text: 'Version',
                source: 'version',
                format: 'string',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'scope',
                text: 'Scope',
                source: 'scope',
                format: 'string',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'creationTimestamp',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 10,
                sortable: true,
                visible: true
            }
        ]
    }
)
spaces.set('crdGroup',
    {
        text:'Name',
        source:'name',
        width:40,
        leftItems: [],
        properties: []
    }
)
spaces.set('crdInstance',
    {
        text:'Name',
        source:'name',
        width:40,
        leftItems: [
            {   name: 'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {   name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            },
            {
                name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            },
        ],
        properties: [
            {
                name: 'namespace',
                text: 'Namespace',
                source: 'namespace',
                format: 'string',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'source',
                text: 'Source',
                source: 'source',
                format: 'string',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'checksum',
                text: 'Checksum',
                source: 'checksum',
                format: 'string',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'creationTimestamp',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 10,
                sortable: true,
                visible: true
            }
        ]
    }
)

spaces.set('crdNamespacedInstance',
    {
        text:'Name',
        source:'name',
        width:40,
        leftItems: [
            {   name: 'details',
                icon: <Info fontSize='small'/>,
                text: 'Details',
                permission: true,
            },
            {   name: 'edit',
                icon: <Edit fontSize='small'/>,
                text: 'Edit',
                permission: true,
            },
            {
                name: 'delete',
                icon: <Delete fontSize='small'/>,
                text: 'Delete',
                multi: true,
                permission: true,
            },
        ],
        properties: [
            {
                name: 'namespace',
                text: 'Namespace',
                source: 'namespace',
                format: 'string',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'source',
                text: 'Source',
                source: 'source',
                format: 'string',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'checksum',
                text: 'Checksum',
                source: 'checksum',
                format: 'string',
                width: 15,
                sortable: true,
                visible: true
            },
            {
                name: 'creationTimestamp',
                text: 'Age',
                source: 'creationTimestamp',
                format: 'age',
                width: 10,
                sortable: true,
                visible: true
            }
        ]
    }
)

// General  (these empty classes are needed for showing icons on the navigation pane, they are referenced in the "icons" map)
spaces.set('classOverview', {
        leftItems: [
            // +++ pending impl in phase 2
            // {
            //     name: 'kwirthworks',
            //     icon: <HomeRepairService fontSize='small'/>,
            //     text: 'Kwirth works',
            //     permission: true,
            // },
            {
                name: 'kubeworks',
                icon: <HomeRepairService fontSize='small'/>,
                text: 'Kube works',
                permission: true,
            },
            {
                name: 'exit',
                text: 'Exit',
                permission: true
            },
        ]
    }
)
spaces.set('classmenu', {})  // not needed
spaces.set('classWorkload', {})
spaces.set('classConfig', {})
spaces.set('classNetwork', {})
spaces.set('classStorage', {})
spaces.set('classAccess', {})
spaces.set('classCustom', {})
spaces.set('classSettings', {})

const icons = new Map()
icons.set('classOverview', { default: <Kubernetes size={'16'}/> } )
icons.set('classCluster', { default: <Cluster size={'16'}/> } )
icons.set('classWorkload', { default: <Pod size={'16'}/> } )
icons.set('classConfig', { default: <Config size={'16'}/> } )
icons.set('classNetwork', { default: <Network size={'16'}/> } )
icons.set('classStorage', { default: <Storage size={'16'}/> } )
icons.set('classAccess', { default: <Security size={'16'}/> } )
icons.set('classCustom', { default: <Customize size={'16'}/> } )
icons.set('classSettings', { default: <Settings size={'16'}/> } )

const actions = new Map()

export { spaces, menu, icons, actions }