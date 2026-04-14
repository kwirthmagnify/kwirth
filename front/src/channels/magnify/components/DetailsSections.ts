import { IDetailsItem, IDetailsSection } from "./DetailsObject"

export const objectSections = new Map<string,IDetailsSection[]>()

// common properties and attributes to use in sections
let basicCluster:IDetailsItem[] = [
    {
        name: 'created',
        text: 'Created',
        source: ['metadata.creationTimestamp'],
        format: 'string',
        style: ['ifpresent']
    },
    {
        name: 'name',
        text: 'Name',
        source: ['metadata.name'],
        format: 'string'
    },
    {
        name: 'labels',
        text: 'Labels',
        source: ['metadata.labels'],
        format: 'objectprops',
        style: ['column', 'ifpresent', 'collapse']
    },
    {
        name: 'annotations',
        text: 'Annotations',
        source: ['metadata.annotations'],
        format: 'objectprops',
        style: ['column','ifpresent', 'char:50', 'collapse']
    }
]

let basicNamespaced:IDetailsItem[] = [
    {
        name: 'created',
        text: 'Created',
        source: ['metadata.creationTimestamp'],
        format: 'string'
    },
    {
        name: 'name',
        text: 'Name',
        source: ['metadata.name'],
        format: 'string'
    },
    {
        name: 'namespace',
        text: 'Namespace',
        source: ['#metadata.namespace'],
        format: 'string',
        style: ['link:$Namespace:metadata.namespace:.']
    },
    {
        name: 'labels',
        text: 'Labels',
        source: ['metadata.labels'],
        format: 'objectprops',
        style: ['column', 'ifpresent', 'collapse']
    },
    {
        name: 'annotations',
        text: 'Annotations',
        source: ['metadata.annotations'],
        format: 'objectprops',
        style: ['column', 'char:50', 'ifpresent', 'collapse']
    }
]

let conditions:IDetailsItem = {
    name: 'conditions',
    text: 'Conditions',
    source: ['status.conditions'],
    format: 'objectlist',
    style: ['table', 'ifpresent'],  // 'collapse'
    items: [
        {
            name: 'type',
            text: 'Type',
            source: ['type'],
            format: 'string',
            style: ['property:status:True:text.primary', 'property:status:False:text.disabled']
        },
        {
            name: 'reason',
            text: 'Reason',
            source: ['reason'],
            format: 'string',
            style: [
                'FailedCreate:red',
                'Available:green',
                'Progressing:green',
                'NewReplicaSetAvailable:green',
                'MinimumReplicasUnavailable:red',
                'MinimumReplicasAvailable:green',
                'InsufficientPods:red',
                'PodCompleted:green',
                'KubeletHasSufficientMemory:green',
                'KubeletHasNoDiskPressure:green',
                'KubeletHasSufficientPID:green',
                'KubeletReady:green',
                'CompletionsReached:green',
                'KernelHasNoDeadlock:green',
                'NoFrequentContainerdRestart:green',
                'NoFrequentKubeletRestart:green',
                'ContainerRuntimeIsUp:green',
                'FilesystemIsOK:green',
                'KubeletIsUp:green',
                'NoFrequentDockerRestart:green',
                'NoFrequentUnregisterNetDevice:green',
                'SufficientPods:green',
                'NoConflicts:green',
                'InitialNamesAccepted:green',
                'Unschedulable:red',
                'BackoffLimitExceeded:red',
                'ContainersNotReady:red',
                'NoVMEventScheduled:green',
                'FilesystemIsNotReadOnly:orange',
            ]
        },
        {
            name: 'message',
            text: 'Message',
            source: ['message'],
            format: 'string',
        },
        {
            name: 'age',
            text: 'Age',
            source: ['lastUpdateTime||lastTransitionTime||$default'],
            format: 'age',
        }
    ]
}

let events: IDetailsSection = {
    name: 'events',
    text: 'Events',
    root: 'events',
    items: [
        {
            name: 'events',
            text: '',
            source: ['list'],
            format: 'objectlist',
            style: ['table'],
            items: [
                {
                    name: 'message',
                    text: 'Message',
                    source: ['message'],
                    format: 'string',
                },
                {
                    name: 'count',
                    text: 'Count',
                    source: ['count'],
                    format: 'string',
                },
                {
                    name: 'age',
                    text: 'Age',
                    source: ['lastTimestamp'],
                    format: 'age',
                },
            ],
        }
    ]
}

export const podsSection:IDetailsSection =     {
    name: 'pods',
    text: 'Pods',
    root: 'origin',
    items: [
        {
            name: 'pods',
            text: '',
            source: ['@string[]'],
            format: 'objectlist',
            style: ['table'],
            items: [
                {
                    name: 'name',
                    text: 'Name',
                    source: ['#metadata.name'],
                    format: 'string',
                    style: ['link:$Pod:metadata.name:metadata.namespace']
                },
                {
                    name: 'node',
                    text: 'Node',
                    source: ['#spec.nodeName'],
                    format: 'string',
                    style: ['link:$Node:spec.nodeName:.']
                }
            ]
        }
    ]
}

objectSections.set('PersistentVolumeClaim', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicNamespaced,
            {
                name: 'finalizers',
                text: 'Finalizers',
                source: ['metadata.finalizers'],
                format: 'stringlist',
           },
           {
                name: 'accessModes',
                text: 'Access Modes',
                source: ['spec.accessModes'],
                format: 'stringlist',
           },
           {
                name: 'storageClassName',
                text: 'Storage Class',
                source: ['#spec.storageClassName'],
                format: 'string',
                style: ['link:$StorageClass:spec.storageClassName:.']
           },

           {
                name: 'storage',
                text: 'Storage',
                source: ['spec.resources.requests.storage'],
                format: 'string',
           },
           {
                name: 'pods',
                text: 'Pods',
                source: ['#@string[]'],
                format: 'stringlist',
                style: ['column', 'link:$Pod:name:$$namespace']
           },
           {
                name: 'status',
                text: 'Status',
                source: ['status.phase'],
                format: 'string',
                style: [ 'Bound:green','Pending:orange']
           },
           {
                name: 'pv',
                text: 'PV',
                source: ['#spec.volumeName'],
                format: 'string',
                style: ['link:$PersistentVolume:spec.volumeName:.']
           }
        ]
    },
    events
])

objectSections.set('PersistentVolume', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicCluster,
            {
                name: 'finalizers',
                text: 'Finalizers',
                source: ['metadata.finalizers'],
                format: 'stringlist',
           },
            {
                name: 'capacity',
                text: 'Capacity',
                source: ['spec.capacity.storage'],
                format: 'string',
           },
           {
                name: 'accessModes',
                text: 'Access Modes',
                source: ['spec.accessModes'],
                format: 'stringlist',
           },
           {
                name: 'persistentVolumeReclaimPolicy',
                text: 'Reclaim Policy',
                source: ['spec.persistentVolumeReclaimPolicy'],
                format: 'string',
           },
           {
                name: 'storageClassName',
                text: 'Storage Class',
                source: ['#spec.storageClassName'],
                format: 'string',
                style: ['link:$StorageClass:spec.storageClassName:.']
           },
           {
                name: 'status',
                text: 'Status',
                source: ['status.phase'],
                format: 'string',
           },
           {
                name: 'pvc',
                text: 'PVC',
                source: ['#spec.claimRef.name'],
                format: 'string',
                style: ['link:spec.claimRef.kind:spec.claimRef.name:spec.claimRef.namespace']
           }
        ]
    },
    events
])

objectSections.set('StorageClass', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicCluster,
            {
                name: 'provisioner',
                text: 'Provisioner',
                source: ['#provisioner'],
                format: 'string',
                style: ['link:$CSIDriver:provisioner:.']
           },
            {
                name: 'volumeBindingMode',
                text: 'Binding Mode',
                source: ['volumeBindingMode'],
                format: 'string',
           },
           {
                name: 'reclaimPolicy',
                text: 'Reclaim Policy',
                source: ['reclaimPolicy'],
                format: 'string',
           },
           {
                name: 'pvs',
                text: 'PV',
                source: ['#@string[]'],
                format: 'stringlist',
                style: ['column', 'link:$PersistentVolume:.:.', 'ifpresent']
           },
           {
                name: 'pvcs',
                text: 'PVC',
                source: ['@object[]'],
                items: [ 
                    {
                        name: 'pvc',
                        text: '',
                        source: ['#name'],
                        format: 'string',
                        style: [ 'link:$PersistentVolumeClaim:name:namespace' ]
                    }
                ],
                format: 'objectlist',
                style: ['column']
           }
        ]
    },
    events
])

objectSections.set('VolumeAttachment', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicCluster,
            {
                name: 'attacher',
                text: 'Attacher',
                source: ['#spec.attacher'],
                format: 'string',
                style: ['link:$CSIDriver:spec.attacher:.']
           },
            {
                name: 'nodeName',
                text: 'Node Name',
                source: ['#spec.nodeName'],
                format: 'string',
                style: ['link:$Node:spec.nodeName:.']
           },
           {
                name: 'persistentVolumeName',
                text: 'PV',
                source: ['#spec.source.persistentVolumeName'],
                format: 'string',
                style: ['link:$PersistentVolume:spec.source.persistentVolumeName:.']
           },
           {
                name: 'attached',
                text: 'Attached',
                source: ['status.attached'],
                format: 'boolean',
                style: [ 'true:Yes:green','false:No:red', ':No:red']
           },
           {
                name: 'attachError',
                text: 'Attach Error',
                source: ['status.attachError.time', '$\u00a0\u00a0-\u00a0\u00a0', 'status.attachError.message'],
                format: 'string',
                style: [ 'ifpresent', 'color:red']
           },
           {
                name: 'detachError',
                text: 'Detach Error',
                source: ['status.detachError.time', '$\u00a0\u00a0-\u00a0\u00a0', 'status.detachError.message'],
                format: 'string',
                style: [ 'ifpresent', 'color:red']
           }
        ]
    },
    events
])

objectSections.set('CSIDriver', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicCluster,
            {
                name: 'attachRequired',
                text: 'Attach Required',
                source: ['spec.attachRequired'],
                format: 'boolean',
                style: [ 'true:Yes:green','false:No:red', ':No:red']
            },
            {
                name: 'fsGroupPolicy',
                text: 'Group Policy',
                source: ['spec.fsGroupPolicy'],
                format: 'string',
            },
            {
                name: 'republish',
                text: 'Requires republish',
                source: ['spec.requiresRepublish'],
                format: 'boolean',
                style: [ 'true:Yes:green','false:No:red', ':No:red']
            },
            {
                name: 'linuxMount',
                text: 'LinuxMount',
                source: ['spec.seLinuxMount'],
                format: 'boolean',
                style: [ 'true:Yes:green','false:No:red', ':No:red']
            },
            {
                name: 'stgCap',
                text: 'Stg Capacity',
                source: ['spec.storageCapacity'],
                format: 'boolean',
                style: [ 'true:Yes:green','false:No:red', ':No:red']
            },
            {
                name: 'volumeLifecycleModes',
                text: 'Lifecycle modes',
                source: ['spec.volumeLifecycleModes'],
                format: 'stringlist',
            },
            {
                name: 'storageClasses',
                text: '',
                source: ['@jsx[]'],
                format: 'string',
                style: ['column']
            },
        ]
    },
    events
])


objectSections.set('CSINode', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicCluster,
            {
                name: 'drivers',
                text: 'Drivers',
                source: ['spec.drivers'],
                format: 'objectlist',
                style: ['column'],
                items: [
                    {
                        name: 'name',
                        text: 'Name',
                        source: ['#name'],
                        format: 'string',
                        style: [ 'link:$CSIDriver:name:.']
                    },
                ]
            },
        ]
    },
    events
])


objectSections.set('CSIStorageCapacity', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicCluster,
        ]
    },
    events
])


objectSections.set('NetworkPolicy', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicCluster,
            {
                name: 'podSelector',
                text: 'Pod Selector',
                source: ['spec.podSelector.matchLabels'],
                format: 'objectprops'
            },
        ]
    },
    events
])

objectSections.set('Service', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicNamespaced,
            {
                name: 'selector',
                text: 'Selector',
                source: ['spec.selector'],
                format: 'objectprops',
                style: ['column']
            },
        ]
    },
    {
        name: 'connection',
        text: 'Connection',
        root: 'origin',
        items: [
            {
                name: 'clusterIp',
                text: 'Cluster IP',
                source: ['spec.clusterIP'],
                format: 'string'
            },
            {
                name: 'clusterIps',
                text: 'Cluster IPs',
                source: ['spec.clusterIPs'],
                format: 'stringlist'
            },
            {
                name: 'ipFamilies',
                text: 'IP families',
                source: ['spec.ipFamilies'],
                format: 'stringlist'
            },
            {
                name: 'ipFamilyPolicy',
                text: 'IP family policy',
                source: ['spec.ipFamilyPolicy'],
                format: 'string'
            },
            {
                name: 'ports',
                text: 'Ports',
                source: ['spec.ports'],
                format: 'objectlist',
                //style: ['fullwidth', 'column'],
                style: ['column'],
                items: [
                    {
                        name: 'forward',
                        text: 'Forward',
                        source: ['@jsx'],
                        format: 'string',
                    }
                ]
            },
        ]
    },
    events
])

objectSections.set('Endpoints', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicNamespaced
        ]
    },
    {
        name: 'subsets',
        text: 'Subsets',
        root: 'origin',
        items: [
            {
                name: 'subsetlist',
                text: '',
                source: ['subsets'],
                format: 'objectlist',
                items: [
                    {
                        name: 'address',
                        text: 'Address',
                        source: ['addresses'],
                        format: 'objectlist',
                        style:['table'],
                        items: [
                            {
                                name: 'ip',
                                text: 'IP',
                                source: ['ip'],
                                format: 'string'
                            },
                            {
                                name: 'target',
                                text: 'Target',
                                source: ['targetRef.kind', '$\u00a0', '#targetRef.name', '$\u00a0(namespace:\u00a0', 'targetRef.namespace', '$)'],
                                format: 'string',
                                style: ['link:targetRef.kind:targetRef.name:targetRef.namespace', 'ifpresent']
                            }
                        ]
                    },                    
                ]
            },

        ]
    },
    events
])

objectSections.set('Ingress', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicNamespaced,
            {
                name: 'ingressClass',
                text: 'Ingress class',
                source: ['#spec.ingressClassName'],
                format: 'string',
                style: ['bold', 'link:$IngressClass:spec.ingressClassName:.']
            },
        ]
    },
    {
        name: 'rules',
        text: 'Rules',
        root: 'origin',
        items: [
            {
                name: 'host',
                text: 'Host',
                source: ['spec.rules'],
                format: 'objectlist',
                style: ['table'],
                items: [
                    {
                        name: 'host',
                        text: 'Host',  
                        source: ['host'],
                        format: 'string',
                        style:['bold']
                    },
                    {
                        name: 'paths',
                        text: 'Paths',  
                        source: ['http.paths'],
                        format: 'objectlist',
                        style: ['column'],
                        items: [
                            {
                                name: 'path',
                                text: 'Path',  
                                source: ['path', '$\u00a0(', '#backend.service.name', '$:', 'backend.service.port.number', '$)', ],
                                format: 'string',
                                style: [ 'link:$Service:backend.service.name:$$namespace']
                            },
                        ]
                    }
                ],
            },
        ]
    },
    events
])

objectSections.set('IngressClass', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicCluster,
            {
                name: 'controller',
                text: 'Controller',
                source: ['spec.controller'],
                format: 'string'
            },
            {
                name: 'default',
                text: 'Default',
                source: ['metadata.annotations["ingressclass.kubernetes.io/is-default-class"]'],
                format: 'boolean',
                style: ['true:Yes:green','false:No:red','undefined:No:red',':No:red']
            },
            {
                name: 'ingresses',
                text: 'Ingress',
                source: ['@object[]'],
                items: [ 
                    {
                        name: 'ingress',
                        text: '',
                        source: ['#name'],
                        format: 'string',
                        style: [ 'link:$Ingress:name:namespace' ]
                    }
                ],
                format: 'objectlist',
                style: ['column']
            }
        ]
    },
    events
])

objectSections.set('Namespace', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicCluster,
            {
                name: 'status',
                text: 'Status',
                source: ['status.phase'],
                format: 'string',
                style: ['Active:green']
            },
        ]
    },
    {
        name: 'content',
        text: 'Content',
        root: 'origin',
        items: [
            {
                name: 'content',
                text: 'Content',
                source: ['@jsx[]'],
                format: 'string',  // ignored
                style: ['column']
            },
        ]
    },
    events
])

objectSections.set('Node', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicCluster,
            {
                name: 'finalizers',
                text: 'Finalizers',
                source: ['metadata.finalizers'],
                format: 'stringlist',
                style: ['column']
            },
            {
                name: 'os',
                text: 'OS',
                source: ['status.nodeInfo.operatingSystem', '$(', 'status.nodeInfo.architecture', '$)'],
                format: 'string',
            },
            {
                name: 'osImage',
                text: 'OS Image',
                source: ['status.nodeInfo.osImage'],
                format: 'string',
            },
            {
                name: 'kernelVersion',
                text: 'Kernel version',
                source: ['status.nodeInfo.kernelVersion'],
                format: 'string',
            },
            {
                name: 'containerRuntime',
                text: 'CRI',
                source: ['status.nodeInfo.containerRuntimeVersion'],
                format: 'string',
            },
            {
                name: 'kubeletVersion',
                text: 'Kubelet',
                source: ['status.nodeInfo.kubeletVersion'],
                format: 'string',
            },
            conditions
        ]
    },
    {
        name: 'workload',
        text: 'Workload',
        root: 'origin',
        items: [
            {
                name: 'taints',
                text: 'Taints',
                source: ['spec.taints'],
                format: 'objectlist',
                style: ['table'],
                items: [
                    {
                        name: 'taint',
                        text: 'Taint',
                        source: ['key'],
                        format: 'string',
                    },
                    {
                        name: 'effect',
                        text: 'Effect',
                        source: ['effect'],
                        format: 'string',
                    },
                    {
                        name: 'age',
                        text: 'Age',
                        source: ['timeAdded'],
                        format: 'age',
                    }
                ],
            },
        ]
    },
    {
        name: 'compute',
        text: 'Compute',
        root: 'origin',
        items: [
            {
                name: 'capacity',
                text: 'Capacity',
                source: ['status.capacity'],
                format: 'objectprops',
                style: ['table'],
                items: [
                    {
                        name: 'cpu',
                        text: 'CPU',
                        source: ['status.capacity.cpu'],
                        format: 'string',
                    },
                    {
                        name: 'storage',
                        text: 'Storage',
                        source: ['status.capacity.ephemeral-storage'],
                        format: 'string',
                        style: ['mb'],
                    },
                    {
                        name: 'hp1gi',
                        text: 'Hugepages-1Gi',
                        source: ['status.capacity.hugepages-2Mi'],
                        format: 'string',
                    },
                    {
                        name: 'hp2m',
                        text: 'Hugepages-2Mi',
                        source: ['status.capacity.hugepages-1Gi'],
                        format: 'string',
                    },                    
                    {
                        name: 'memory',
                        text: 'Memory',
                        source: ['status.capacity.memory'],
                        format: 'string',
                        style: ['mb'],
                    },
                    {
                        name: 'pods',
                        text: 'Pods',
                        source: ['status.capacity.pods'],
                        format: 'string',
                    }                    
                ]
            },
            {
                name: 'allocatable',
                text: 'Allocatable',
                source: ['status.allocatable'],
                format: 'objectprops',
                style: ['table'],
                items: [
                    {
                        name: 'cpu',
                        text: 'CPU',
                        source: ['status.allocatable.cpu'],
                        format: 'string',
                    },
                    {
                        name: 'storage',
                        text: 'Storage',
                        source: ['status.allocatable.ephemeral-storage'],
                        format: 'string',
                        style: ['mb'],
                    },
                    {
                        name: 'hp1gi',
                        text: 'Hugepages-1Gi',
                        source: ['status.allocatable.hugepages-2Mi'],
                        format: 'string',
                    },
                    {
                        name: 'hp2m',
                        text: 'Hugepages-2Mi',
                        source: ['status.allocatable.hugepages-1Gi'],
                        format: 'string',
                    },                    
                    {
                        name: 'memory',
                        text: 'Memory',
                        source: ['status.allocatable.memory'],
                        format: 'string',
                        style: ['mb'],
                    },
                    {
                        name: 'pods',
                        text: 'Pods',
                        source: ['status.allocatable.pods'],
                        format: 'string',
                    }                    
                ]
            },
        ]
    },
    {
        name: 'storage',
        text: 'Storage',
        root: 'origin',
        items: [
            {
                name: 'inuse',
                text: 'In Use',
                source: ['#status.volumesInUse'],
                format: 'stringlist',
                style: ['column', 'link:$PersistentVolume:.:.'],
                processValue: (value) => {
                    return value.split('/')[value.split('/').length-1]
                }
            },
            {
                name: 'attached',
                text: 'Attached',
                source: ['status.volumesAttached'],
                format: 'objectlist',
                style: ['column'],
                items: [
                    {
                        name: 'name',
                        text: '',
                        source: ['#name'],
                        format: 'string',
                        style: ['column', 'link:$PersistentVolume:name:.'],
                        processValue: (value) => {
                            return value.split('/')[value.split('/').length-1]
                        }
                    },
                ]
            },
        ]
    },
    {
        name: 'network',
        text: 'Network',
        root: 'origin',
        items: [
            {
                name: 'addresses',
                text: 'Addresses',
                source: ['status.addresses'],
                format: 'objectlist',
                style: ['table' ],
                items: [
                    {
                        name: 'type',
                        text: 'Type',
                        source: ['type'],
                        format: 'string',
                    },
                    {
                        name: 'value',
                        text: 'Value',
                        source: ['address'],
                        format: 'string',
                    }
                ]
            },
        ]
    },
    events
])

objectSections.set('V1APIResource', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            {
                name: 'kind',
                text:'Kind',
                format: 'string',
                source: ['kindName'],
            },
            {
                name: 'namespaced',
                text:'Namespaced',
                format: 'boolean',
                source: ['namespaced'],
                style: [ 'ifpresent','true:Yes:green','false:No:red', ':No:red']
            },
            {
                name: 'shortNames',
                text:'Short names',
                format: 'string',
                source: ['shortNames'],
                style: ['ifpresent']
            },
            {
                name: 'singularName',
                text:'Singular',
                format: 'string',
                source: ['singularName'],
                style: ['ifpresent']
            },
            {
                name: 'categories',
                text:'Categories',
                format: 'stringlist',
                source: ['categories'],
                style: ['ifpresent']
            },
            {
                name: 'verbs',
                text:'Verbs',
                format: 'stringlist',
                source: ['verbs'],
                style: ['ifpresent']
            },
        ]
    }
])

objectSections.set('Image', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            {
                name: 'name',
                text: 'Name',
                source: ['displayName'],
                format: 'string',
            },
            {
                name: 'registry',
                text: 'Registry',
                source: ['registry'],
                format: 'string',
            },
            {
                name: 'tag',
                text: 'Tag',
                source: ['tag'],
                format: 'string',
            },
            {
                name: 'sha',
                text: 'SHA',
                source: ['sha'],
                format: 'string',
            },
            {
                name: 'names',
                text: 'Names',
                source: ['names'],
                format: 'stringlist',
                style: ['column']
            },
            {
                name: 'nodes',
                text: 'Nodes',
                source: ['#nodes'],
                format: 'stringlist',
                style: ['column', 'link:$Node:.:.']
            },
        ]
    }
])

objectSections.set('ComponentStatus', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicCluster,
        ]
    },
    {
        name: 'conditions',
        text: 'Conditions',
        root: 'origin',
        items: [
            {
                name: 'conditions',
                text: '',
                source: ['conditions'],
                format: 'objectlist',
                style: ['table'],
                items: [
                    {
                        name: 'status',
                        text: 'Status',
                        source: ['status'],
                        format: 'string',
                    },
                    {
                        name: 'type',
                        text: 'Type',
                        source: ['type'],
                        format: 'string',
                    },
                    {
                        name: 'message',
                        text: 'Message',
                        source: ['message'],
                        format: 'string',
                    },
                ]
            },
        ]
    },
    events
])

objectSections.set('ConfigMap', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicNamespaced,
        ]
    },
    {
        name: 'data',
        text: 'Data',
        root: 'origin',
        items: [
            {
                name: 'item',
                text: '',
                source: ['data'],
                format: 'objectprops',
                style: ['column', 'edit', 'keybold', 'multiline']
            },
        ]
    },
    events
])

objectSections.set('Secret', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicNamespaced,
            {
                name: 'type',
                text: 'Type',
                source: ['type'],
                format: 'string'
            },
        ]
    },
    {
        name: 'data',
        text: 'Data',
        root: 'origin',
        items: [
            {
                name: 'item',
                text: '',
                source: ['data'],
                format: 'objectprops',
                style: ['column', 'edit', 'keybold', 'multiline', 'lockicon', 'base64']
            },
        ]
    },
    events
])

objectSections.set('LimitRange', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicNamespaced,
        ]
    },
    {
        name: 'limits',
        text: 'Limits',
        root: 'origin',
        items: [
            {
                name: 'limits',
                text: '',
                source: ['spec.limits'],
                format: 'objectlist',
                style: ['table'],
                items: [
                    {
                        name: 'type',
                        text: 'Type',  
                        source: ['type'],
                        format: 'string'
                    },
                    {
                        name: 'maxcpu',
                        text: 'MaxCPU',  
                        source: ['max.cpu'],
                        format: 'string'
                    },
                    {
                        name: 'maxmem',
                        text: 'MaxMem',  
                        source: ['max.memory'],
                        format: 'string'
                    },
                    {
                        name: 'mincpu',
                        text: 'MinCPU',  
                        source: ['min.cpu'],
                        format: 'string'
                    },
                    {
                        name: 'minmem',
                        text: 'MinMem',  
                        source: ['min.memory'],
                        format: 'string'
                    },
                    {
                        name: 'defcpu',
                        text: 'DefaultCPU',  
                        source: ['default.cpu'],
                        format: 'string'
                    },
                    {
                        name: 'defmem',
                        text: 'DefaultMem',  
                        source: ['default.memory'],
                        format: 'string'
                    },
                    {
                        name: 'defreqcpu',
                        text: 'DefReqCPU',  
                        source: ['defaultRequest.cpu'],
                        format: 'string'
                    },
                    {
                        name: 'defreqmem',
                        text: 'DefReqMem',  
                        source: ['defaultRequest.memory'],
                        format: 'string'
                    },
                ]
            },
        ]
    },
    events
])

objectSections.set('HorizontalPodAutoscaler', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicNamespaced,
            {
                name: 'reference',
                text: 'Reference',
                source: ['spec.scaleTargetRef.kind', '$\u00A0/\u00A0', 'spec.scaleTargetRef.name'],
                format: 'string'
            },
            {
                name: 'minPods',
                text: 'Min Pods',
                source: ['spec.minReplicas'],
                format: 'string'
            },
            {
                name: 'maxPods',
                text: 'Max Pods',
                source: ['spec.maxReplicas'],
                format: 'string'
            },
            {
                name: 'replicas',
                text: 'Replicas',
                source: ['status.desiredReplicas'],
                format: 'string'
            }
        ]
    },
    events
])

objectSections.set('PodDisruptionBudget', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicNamespaced,
            {
                name: 'minAvailable',
                text: 'Min Available',
                source: ['spec.minAvailable'],
                format: 'string',
                style: ['ifpresent']
            },
            {
                name: 'selector',
                text: 'Selector',
                source: ['spec.selector.matchLabels'],
                format: 'objectprops',
                style: ['column']
            },
            conditions
        ]
    },
    events
])

objectSections.set('PriorityClass', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicCluster,
            {
                name: 'preemptionPolicy',
                text: 'Policy',
                source: ['preemptionPolicy'],
                format: 'string'
            },
        ]
    },
    events
])

objectSections.set('RuntimeClass', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicCluster,
            {
                name: 'handler',
                text: 'Handler',
                source: ['handler'],
                format: 'string'
            },
        ]
    },
    events
])

objectSections.set('Lease', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicNamespaced,
            {
                name: 'holderIdentity',
                text: 'Holder',
                source: ['spec.holderIdentity'],
                format: 'string',
            },
            {
                name: 'leaseDurationSeconds',
                text: 'Duration',
                source: ['spec.leaseDurationSeconds'],
                format: 'string'
            },
            {
                name: 'acquireTime',
                text: 'Acquire',
                source: ['spec.acquireTime'],
                format: 'string',
                style: ['ifpresent']
            },
            {
                name: 'renewTime',
                text: 'Renew',
                source: ['spec.renewTime'],
                format: 'string'
            },
            {
                name: 'leaseTransitions',
                text: 'Transitions',
                source: ['spec.leaseTransitions'],
                format: 'string',
                style: ['ifpresent']
            },
        ]
    },
    events
])

objectSections.set('ValidatingWebhookConfiguration', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicCluster,
        ]
    },
    {
        name: 'webhooks',
        text: 'Webhooks',
        root: 'origin',
        items: [ {
                name:'webhooks',
                text:'',
                format:'objectlist',
                source: ['webhooks'],
                style: ['table'],
                items: [
                {
                    name: 'name',
                    text: 'Name',
                    source: ['name'],
                    format: 'string'
                },
                {
                    name: 'clientConfig',
                    text: 'Client Config',
                    source: ['clientConfig.service'],
                    format: 'objectprops',
                    style: ['column'],
                    items: [
                        {
                            name: 'clientconfig',
                            text: 'CCName',
                            source: ['name'],
                            format: 'string'
                        },
                        {
                            name: 'name',
                            text: 'Name',
                            source: ['clientConfig.service.name'],
                            format: 'string'
                        },
                        {
                            name: 'namespace',
                            text: 'Namespace',
                            source: ['#clientConfig.service.namespace'],
                            format: 'string',
                            style: ['link:$Namespace:clientConfig.service.namespace:.']
                        },
                        {
                            name: 'route',
                            text: 'Route',
                            source: ['clientConfig.service.path','$:','clientConfig.service.port'],
                            format: 'string'
                        }
                    ]
                },
                {
                    name: 'rules',
                    text: 'Rules',
                    source: ['rules'],
                    format: 'objectlist',
                    style: ['column'],
                    items: [
                        {
                            name: 'scope',
                            text: 'Scope',
                            source: ['scope'],
                            format: 'string',
                            style: ['header']
                        },
                        {
                            name: 'operations',
                            text: 'operations',
                            source: ['operations'],
                            format: 'stringlist',
                            style:['header']
                        },
                        {
                            name: 'apiGroups',
                            text: 'Groups',
                            source: ['apiGroups'],
                            format: 'stringlist',
                            style:['header']
                        },
                        {
                            name: 'apiVersions',
                            text: 'API Versions',
                            source: ['apiVersions'],
                            format: 'stringlist',
                            style:['header']
                        },
                        {
                            name: 'resources',
                            text: 'Resources',
                            source: ['resources'],
                            format: 'stringlist',
                            style:['header']
                        },
                        
                    ],
                }
                ]}
            
        ],
    },
    events
])

objectSections.set('MutatingWebhookConfiguration', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicCluster,
        ]
    },
    {
        name: 'webhooks',
        text: 'Webhooks',
        root: 'origin',
        items: [ {
                name:'webhooks',
                text:'',
                format:'objectlist',
                source: ['webhooks'],
                style: ['table'],
                items: [
                {
                    name: 'name',
                    text: 'Name',
                    source: ['name'],
                    format: 'string'
                },
                {
                    name: 'clientConfig',
                    text: 'Client Config',
                    source: ['clientConfig.service'],
                    format: 'objectprops',
                    style: ['column'],
                    items: [
                        {
                            name: 'clientconfig',
                            text: 'CCName',
                            source: ['name'],
                            format: 'string'
                        },
                        {
                            name: 'name',
                            text: 'Name',
                            source: ['clientConfig.service.name'],
                            format: 'string'
                        },
                        {
                            name: 'namespace',
                            text: 'Namespace',
                            source: ['#clientConfig.service.namespace'],
                            format: 'string',
                            style: ['link:$Namespace:clientConfig.service.namespace:.']
                        },
                        {
                            name: 'port',
                            text: 'Port',
                            source: ['clientConfig.service.port'],
                            format: 'string'
                        }
                    ]
                },
                {
                    name: 'rules',
                    text: 'Rules',
                    source: ['rules'],
                    format: 'objectlist',
                    style: ['column'],
                    items: [
                        {
                            name: 'scope',
                            text: 'Scope',
                            source: ['scope'],
                            format: 'string',
                            style: ['header']
                        },
                        {
                            name: 'operations',
                            text: 'operations',
                            source: ['operations'],
                            format: 'stringlist',
                            style:['header']
                        },
                        {
                            name: 'apiGroups',
                            text: 'Groups',
                            source: ['apiGroups'],
                            format: 'stringlist',
                            style:['header']
                        },
                        {
                            name: 'apiVersions',
                            text: 'API Versions',
                            source: ['apiVersions'],
                            format: 'stringlist',
                            style:['header']
                        },
                        {
                            name: 'resources',
                            text: 'Resources',
                            source: ['resources'],
                            format: 'stringlist',
                            style:['header']
                        },
                        
                    ],
                }
                ]}
            
        ],
    },
    events
])

objectSections.set('Pod', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicNamespaced,
            {
                name: 'controlledby',
                text: 'Controlled By',
                source: ['metadata.ownerReferences.0.kind', '$\u00A0', '#metadata.ownerReferences.0.name'],
                format: 'string',
                style: ['link:metadata.ownerReferences.0.kind:metadata.ownerReferences.0.name:$$namespace']
            },
            {
                name: 'status',
                text: 'Status',
                source: ['status.phase'],
                format: 'string',
                style: ['Running:green', 'Pending:orange']
            },
            {
                name: 'node',
                text: 'Node',
                source: ['#spec.nodeName'],
                format: 'string',
                style: ['link:$Node:spec.nodeName:.']
            },
            {
                name: 'podip',
                text: 'Pod IP',
                source: ['status.podIP'],
                format: 'string'
            },
            {
                name: 'podips',
                text: 'Pod IPs',
                source: ['status.podIPs'],
                format: 'objectlist',
                items: [
                    {
                        name: 'ip',
                        text: 'IP',
                        source: ['ip'],
                        format: 'string'
                    },
                ]
            },
            {
                name: 'sa',
                text: 'Service Account',
                source: ['#spec.serviceAccount'],
                format: 'string',
                style: ['link:$ServiceAccount:spec.serviceAccount:$$namespace']
            },
            {
                name: 'qosclass',
                text: 'QoS Class',
                source: ['status.qosClass'],
                format: 'string'
            },
            conditions,
            {
                name: 'tolerations',
                text: 'Tolerations',
                source: ['spec.tolerations'],
                format: 'table',
                items: [
                    {
                        name: 'key',
                        text: 'Key',
                        source: ['key'],
                        format: 'string'
                    },
                    {
                        name: 'operator',
                        text: 'Operator',
                        source: ['operator'],
                        format: 'string'
                    },
                    {
                        name: 'value',
                        text: 'Value',
                        source: ['value'],
                        format: 'string'
                    },
                    {
                        name: 'effect',
                        text: 'Effect',
                        source: ['effect'],
                        format: 'string'
                    },
                    {
                        name: 'seconds',
                        text: 'Seconds',
                        source: ['tolerationSeconds'],
                        format: 'string'
                    },
                ]
            },
        ]
    },
    {
        name: 'containers',
        text: 'Containers',
        root: 'origin',
        items: [
            {
                name: 'container',
                text: '',
                source: ['status.containerStatuses|spec.containers:name'],
                format: 'objectobject',
                style: ['column'],
                items: [
                    {
                        name: 'name',
                        text: '',
                        source: ['name'],
                        format: 'string',
                        style:['bold']
                    },
                    {
                        name: 'id',
                        text: 'Id',
                        source: ['containerID'],
                        format: 'string',
                        style:['']
                    },
                    {
                        name: 'state',
                        text: 'State',
                        source: ['state'],
                        format: 'keylist',
                        style: ['running:green', 'waiting:orange']
                    },
                    {
                        name: 'image',
                        text: 'Image',
                        source: ['#image'],
                        format: 'string',
                        style: ['link:$Image:image:.']
                    },
                    {
                        name: 'ports',
                        text: 'Ports',
                        source: ['ports'],
                        format: 'objectlist',
                        style: ['fullwidth', 'ifpresent'],
                        items: [
                            {
                                name: 'forward',
                                text: 'Forward',
                                source: ['@jsx'],
                                format: 'string',
                            }
                        ]
                    },
                    {
                        name: 'envs',
                        text: 'Environment',
                        source: ['env'],
                        format: 'objectlist',
                        style: ['table'],
                        items: [
                            {
                                name: 'env',
                                text: 'Variable',
                                source: ['name'],
                                format: 'string'
                            },
                            {
                                name: 'val',
                                text: 'Value',
                                source: ['value', 'valueFrom.fieldRef.fieldPath'],
                                format: 'string'
                            },
                            {
                                name: 'valSecret',
                                text: 'From Secret',
                                source: ['#valueFrom.secretKeyRef.name', '$/' , 'valueFrom.secretKeyRef.key'],
                                format: 'string',
                                style: ['ifpresent', 'link:$Secret:valueFrom.secretKeyRef.name:$$namespace']
                            },
                            {
                                name: 'valCm',
                                text: 'From CM',
                                source: ['#valueFrom.configMapKeyRef.name', '$/' , 'valueFrom.configMapKeyRef.key'],
                                format: 'string',
                                style: ['ifpresent', 'link:$ConfigMap:valueFrom.configMapKeyRef.name:$$namespace']
                            },
                        ],
                    },
                    {
                        name: 'mounts',
                        text: 'Mounts',
                        source: ['volumeMounts'],
                        format: 'table',
                        items: [
                            {
                                name: 'name',
                                text: 'Name',
                                source: ['name'],
                                format: 'string'
                            },
                            {
                                name: 'path',
                                text: 'Path',
                                source: ['mountPath'],
                                format: 'string'
                            }
                            
                        ]
                    },
                    {
                        name: 'requests',
                        text: 'Requests',
                        source: ['resources.requests'],
                        format: 'objectprops',
                        style: ['table', 'ifpresent']
                    },
                    {
                        name: 'limits',
                        text: 'Limits',
                        source: ['resources.limits'],
                        format: 'objectprops',
                        style: ['table', 'ifpresent']
                    },
                ],
            }
        ]
    },
    {
        name: 'volumes',
        text: 'Volumes',
        root: 'origin',
        items: [
            {
                name: 'volume',
                text: '',
                source: ['spec.volumes'],
                format: 'table',
                items: [
                    {
                        name: 'name',
                        text: 'Name',
                        source: ['name'],
                        format: 'string'
                    },
                    {
                        name: 'mode',
                        text: 'Mount Mode',
                        source: ['projected.defaultMode', 'configMap.defaultMode', 'secret.defaultMode'],
                        format: 'string'
                    },
                    {
                        name: 'pvc',
                        text: 'PVC',
                        source: ['#persistentVolumeClaim.claimName'],
                        format: 'string',
                        style: ['link:$PersistentVolumeClaim:persistentVolumeClaim.claimName:$$namespace']
                    },
                    {
                        name: 'configmap',
                        text: 'ConfigMap',
                        source: ['#configMap.name'],
                        format: 'string',
                        style: ['link:$ConfigMap:configMap.name:$$namespace']
                    },
                    {
                        name: 'secret',
                        text: 'Secret',
                        source: ['#secret.secretName'],
                        format: 'string',
                        style: ['link:$Secret:secret.secretName:$$namespace']
                    },
                    {
                        name: 'projected',
                        text: 'Projected',
                        source: ['projected.sources'],
                        format: 'boolean',
                        style: [ 'true:✔️:green', 'false::']  // ✔️✅❌
                    },
                ]
            },
        ]
    },
    events
])

objectSections.set('Deployment', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicNamespaced,
            {
                name: 'selector',
                text: 'Selector',
                source: ['spec.selector.matchLabels'],
                format: 'objectprops',
                style:['column']
            },
            {
                name: 'replicas',
                text: 'Replicas',
                source: ['spec.replicas'],
                format: 'string'
            },
            {
                name: 'strategyType',
                text: 'Strategy Type',
                source: ['spec.strategy.type'],
                format: 'string',
            },
            {
                name: 'status',
                text: 'Status',
                source: ['@string[]'],
                format: 'string',
                style: ['running:green']
            },
            conditions
        ]
    },
    podsSection,
    events
])

objectSections.set('DaemonSet', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicNamespaced,
            {
                name: 'selector',
                text: 'Selector',
                source: ['spec.selector.matchLabels'],
                format: 'objectprops',
                style:['column']
            },
            {
                name: 'images',
                text: 'Images',
                source: ['spec.template.spec.containers'],
                format: 'objectlist',
                items: [
                    {
                        name: 'image',
                        text: '',
                        source: ['#image'],
                        format: 'string',
                        style: ['link:$Image:image:.']
                    },
                ],
                style:['column']
            },
            {
                name: 'strategy',
                text: 'Strategy',
                source: ['spec.updateStrategy.type'],
                format: 'string',
            },
            {
                name: 'tolerations',
                text: 'Tolerations',
                source: ['spec.template.spec.tolerations'],
                format: 'objectlist',
                items: [
                    {
                        name: 'key',
                        text: 'Key',
                        source: ['key'],
                        format: 'string'
                    },
                    {
                        name: 'operator',
                        text: 'Operator',
                        source: ['operator'],
                        format: 'string'
                    },
                    {
                        name: 'effect',
                        text: 'Effect',
                        source: ['effect'],
                        format: 'string'
                    },
                ],
                style:['table']
            },
        ]
    },
    podsSection,
    events
])

objectSections.set('ReplicaSet', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicNamespaced,
            {
                name: 'controlledby',
                text: 'Controlled By',
                source: ['metadata.ownerReferences.0.kind', '$\u00A0', '#metadata.ownerReferences.0.name'],
                format: 'string',
                style: ['link:metadata.ownerReferences.0.kind:metadata.ownerReferences.0.name:$$namespace']
            },
            {
                name: 'images',
                text: 'Images',
                source: ['spec.template.spec.containers'],
                format: 'objectlist',
                items: [
                    {
                        name: 'image',
                        text: '',
                        source: ['image'],
                        format: 'string'
                    },
                ],
                style:['column']
            },
            {
                name: 'replicas',
                text: 'Replicas',
                source: ['status.readyReplicas||0', '$/', 'spec.replicas'],
                format: 'string',
            },
        ]
    },
    podsSection,
    events
])

objectSections.set('ReplicationController', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicNamespaced,
        ]
    },
    {
        name: 'spec',
        text: 'Spec',
        root: 'origin',
        items: [
            {
                name: 'replicas',
                text: 'Replicas',
                source: ['spec.replicas'],
                format: 'string'
            },
            {
                name: 'selector',
                text: 'Selector',
                source: ['spec.selector'],
                format: 'objectprops'
            },
        ]
    },
    {
        name: 'status',
        text: 'Status',
        root: 'origin',
        items: [
            {
                name: 'replicas',
                text: 'Replicas',
                source: ['spec.replicas'],
                format: 'string'
            },
            {
                name: 'availableReplicas',
                text: 'Available',
                source: ['status.availableReplicas'],
                format: 'string'
            },
            {
                name: 'labelled',
                text: 'Labelled',
                source: ['status.fullyLabeledReplicas'],
                format: 'string'
            },
            {
                name: 'generation',
                text: 'Generation',
                source: ['status.observedGeneration'],
                format: 'string'
            },
        ]
    },
    podsSection,
    events
])

objectSections.set('StatefulSet', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicNamespaced,
            {
                name: 'selector',
                text: 'Selector',
                source: ['spec.selector.matchLabels'],
                format: 'objectprops',
                style: ['column']
            },
            {
                name: 'images',
                text: 'Images',
                source: ['spec.template.spec.containers'],
                format: 'objectlist',
                items: [
                    {
                        name: 'image',
                        text: '',
                        source: ['image'],
                        format: 'string'
                    },
                ],
                style:['column']
            },
        ]
    },
    podsSection,
    events
])

objectSections.set('Job', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicNamespaced,
            {
                name: 'selector',
                text: 'Selector',
                source: ['spec.selector.matchLabels'],
                format: 'objectprops',
            },
            {
                name: 'nodeSelector',
                text: 'Node Selector',
                source: ['spec.template.spec.nodeSelector'],
                format: 'objectprops',
                style: ['ifpresent']
            },
            {
                name: 'images',
                text: 'Images',
                source: ['spec.template.spec.containers'],
                format: 'objectlist',
                items: [
                    {
                        name: 'image',
                        text: '',
                        source: ['image'],
                        format: 'string'
                    },
                ],
                style:['column']
            },
            conditions,
            {
                name: 'completions',
                text: 'Completions',
                source: ['spec.completions'],
                format: 'string',
            },
            {
                name: 'parallelism',
                text: 'Parallelism',
                source: ['spec.parallelism'],
                format: 'string',
            },
        ]
    },
    podsSection,
    events
])

objectSections.set('CronJob', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicNamespaced,
            {
                name: 'schedule',
                text: 'Schedule',
                source: ['spec.schedule'],
                format: 'string',
            },
            {
                name: 'suspended',
                text: 'Suspended',
                source: ['spec.suspend'],
                format: 'boolean',
                style: ['true:Yes:red','false:No:green']
            },
            {
                name: 'lastSchedule',
                text: 'Last Schedule',
                source: ['status.lastScheduleTime'],
                format: 'string',
                style: ['ifpresent']
            },
            {
                name: 'lastSuccessful',
                text: 'Last Success',
                source: ['status.lastSuccessfulTime'],
                format: 'string',
                style: ['ifpresent']
            },
            {
                name: 'nextExecution',
                text: 'Next Execution',
                source: ['@string[]'],
                format: 'string'
            },
            {
                name: 'timeLeft',
                text: 'Time Left',
                source: ['@string[]'],
                format: 'string'
            },
        ]
    },
    {
        name: 'history',
        text: 'History',
        root: 'origin',
        items: [
            {
                name: 'jobs',
                text: '',
                source: ['@string[]'],
                format: 'objectlist',
                style: ['table'],
                items: [
                    {
                        name: 'name',
                        text: 'Name',
                        source: ['#metadata.name'],
                        format: 'string',
                        style: ['link:$Job:metadata.name:$$namespace']
                    },
                    {
                        name: 'age',
                        text: 'Age',
                        source: ['status.startTime'],
                        format: 'age',
                    }
                ]
            }
        ]
    },
    events
])

objectSections.set('ServiceAccount', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicCluster,
            {
                name: 'tokens',
                text: 'Tokens',
                source: ['@object[]'],
                format: 'objectlist',
                style: ['column'],
                items: [
                    {
                        name: 'tokens',
                        text: '',
                        source: ['#name'],
                        format: 'string',
                        style: ['column', 'char:30', 'ifpresent', 'link:$Secret:name:namespace']
                    },
                ]
            },
        ]
    },
    events
])

objectSections.set('ClusterRole', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicCluster
        ]
    },
    {
        name: 'rules',
        text: 'Rules',
        root: 'origin',
        items: [
            {
                name: 'rules',
                text: '',
                source: ['rules'],
                format: 'objectlist',
                items: [
                    {
                        name: 'verbs',
                        text: 'Verbs',  
                        source: ['verbs'],
                        format: 'stringlist',
                        style: ['column']
                    },
                    {
                        name: 'apiGroups',
                        text: 'API Groups',  
                        source: ['apiGroups'],
                        format: 'stringlist',
                        style: ['column']
                    },
                    {
                        name: 'resources',
                        text: 'Resources',
                        source: ['resources'],
                        format: 'stringlist',
                        style: ['column']
                    },
                    {
                        name: 'nonResourceURLs',
                        text: 'Non Resource URLs',
                        source: ['nonResourceURLs'],
                        format: 'stringlist',
                        style: ['column']
                    },
                ],
                style: ['table']
            },
        ]
    },
    events
])

objectSections.set('Role', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicNamespaced
        ]
    },
    {
        name: 'rules',
        text: 'Rules',
        root: 'origin',
        items: [
            {
                name: 'rules',
                text: '',
                source: ['rules'],
                format: 'objectlist',
                items: [
                    {
                        name: 'verbs',
                        text: 'Verbs',  
                        source: ['verbs'],
                        format: 'stringlist',
                        style: ['column']
                    },
                    {
                        name: 'apiGroups',
                        text: 'API Groups',  
                        source: ['apiGroups'],
                        format: 'stringlist',
                        style: ['column']
                    },
                    {
                        name: 'resources',
                        text: 'Resources',
                        source: ['resources'],
                        format: 'stringlist',
                        style: ['column']
                    },
                ],
                style: ['table']
            },
        ]
    }
])

objectSections.set('ClusterRoleBinding', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicCluster
        ]
    },
    {
        name: 'reference',
        text: 'Reference',
        root: 'origin',
        items: [
            {
                name: 'kind',
                text: 'Kind',
                source: ['roleRef.kind'],
                format: 'string'
            },
            {
                name: 'name',
                text: 'Name',
                source: ['#roleRef.name'],
                format: 'string',
                style: ['link:$ClusterRole:roleRef.name:.']
            },
            {
                name: 'apiGroup',
                text: 'API Group',
                source: ['roleRef.apiGroup'],
                format: 'string'
            },
        ]
    },
    {
        name: 'subjects',
        text: 'Subjects',
        root: 'origin',
        items: [
            {
                name: 'bindings',
                text: '',
                source: ['subjects'],
                format: 'objectlist',
                items: [
                    {
                        name: 'kind',
                        text: 'Kind',
                        source: ['kind'],
                        format: 'string'
                    },
                    {
                        name: 'name',
                        text: 'Name',
                        source: ['name'],
                        format: 'string',
                        style: ['link:$ServiceAccount:name:.']
                    },
                    {
                        name: 'namespace',
                        text: 'Namespace',
                        source: ['#namespace'],
                        format: 'string',
                        style: ['link:$Namespace:namespace:.']
                    }
                ],
                style: ['table']
            },
        ]
    },
    events
])

objectSections.set('RoleBinding', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicNamespaced,
        ]
    },
    {
        name: 'reference',
        text: 'Reference',
        root: 'origin',
        items: [
            {
                name: 'kind',
                text: 'Kind',
                source: ['roleRef.kind'],
                format: 'string'
            },
            {
                name: 'name',
                text: 'Name',
                source: ['#roleRef.name'],
                format: 'string',
                style: ['link:$Role:roleRef.name:.']
            },
            {
                name: 'apiGroup',
                text: 'API Group',
                source: ['roleRef.apiGroup'],
                format: 'string'
            },
        ]
    },
    {
        name: 'subjects',
        text: 'Subjects',
        root: 'origin',
        items: [
            {
                name: 'bindings',
                text: '',
                source: ['subjects'],
                format: 'objectlist',
                items: [
                    {
                        name: 'kind',
                        text: 'Kind',
                        source: ['kind'],
                        format: 'string'
                    },                    
                    {
                        name: 'name',
                        text: 'Name',
                        source: ['#name'],
                        format: 'string',
                        style: ['link:$ServiceAccount:name:.']
                    },                    
                    {
                        name: 'namespace',
                        text: 'Namespace',
                        source: ['#namespace'],
                        format: 'string',
                        style: ['link:$Namespace:namespace:.']
                    },                    
                ],
                style: ['table']
            },
        ]
    },
    events
])

objectSections.set('ResourceQuota', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicNamespaced,
        ]
    },
    {
        name: 'quotas',
        text: 'Quotas',
        root: 'origin',
        items: [
            {
                name: 'limitcpu',
                text: 'Limit CPU',
                source: ['status.used[\'limits.cpu\']','status.hard[\'limits.cpu\']'],
                format: 'bar',
                style: ['ifpresent']
            },
            {
                name: 'limitmemory',
                text: 'Limit Memory',
                source: ['status.used[\'limits.memory\']','status.hard[\'limits.memory\']'],
                format: 'bar',
                style: ['ifpresent']
            },
            {
                name: 'requestcpu',
                text: 'Request CPU',
                source: ['status.used[\'requests.cpu\']','status.hard[\'requests.cpu\']'],
                format: 'bar',
                style: ['ifpresent']
            },
            {
                name: 'requestmemory',
                text: 'Request Memory',
                source: ['status.used[\'requests.memory\']','status.hard[\'requests.memory\']'],
                format: 'bar',
                style: ['ifpresent']
            },
            {
                name: 'pods',
                text: 'Pods',
                source: ['status.used[\'count/pods\']','status.hard[\'count/pods\']'],
                format: 'bar',
                style: ['ifpresent']
            },
            {
                name: 'persistentvolumeclaims',
                text: 'PVCs',
                source: ['status.used[\'count/persistentvolumeclaims\']','status.hard[\'count/persistentvolumeclaims\']'],
                format: 'bar',
                style: ['ifpresent']
            },
            {
                name: 'services',
                text: 'Services',
                source: ['status.used[\'count/services\']','status.hard[\'count/services\']'],
                format: 'bar',
                style: ['ifpresent']
            },
            {
                name: 'configmaps',
                text: 'ConfigMaps',
                source: ['status.used[\'count/configmaps\']','status.hard[\'count/configmaps\']'],
                format: 'bar',
                style: ['ifpresent']
            },
            {
                name: 'secrets',
                text: 'Secrets',
                source: ['status.used[\'count/secrets\']','status.hard[\'count/secrets\']'],
                format: 'bar',
                style: ['ifpresent']
            },
        ]
    },
    events
])

objectSections.set('CustomResourceDefinition', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicCluster,
            {
                name: 'group',
                text: 'Group',
                source: ['spec.group'],
                format: 'string',
            },
            {
                name: 'versions',
                text: 'Versions',
                source: ['spec.versions'],
                format: 'objectlist',
                style: ['table'],
                items: [
                    {
                        name: 'name',
                        text: 'Name',
                        source: ['name'],
                        format: 'string',
                    },
                    {
                        name: 'served',
                        text: 'Served',
                        source: ['served'],
                        format: 'boolean',
                        style: ['true:Yes:green', 'false:No:red']
                    },
                    {
                        name: 'storage',
                        text: 'Storage',
                        source: ['storage'],
                        format: 'boolean',
                        style: ['true:Yes:green', 'false:No:red']
                    },
                ]
            },
            conditions
        ]
    },
    {
        name: 'names',
        text: 'Names',
        root: 'origin',
        items: [
            {
                name: 'singular',
                text: 'Singular',
                source: ['spec.names.singular'],
                format: 'string',
            },
            {
                name: 'plural',
                text: 'Plural',
                source: ['spec.names.plural'],
                format: 'string',
            },
            {
                name: 'kind',
                text: 'Kind',
                source: ['spec.names.kind'],
                format: 'string',
            },
            {
                name: 'listKind',
                text: 'List Kind',
                source: ['spec.names.listKind'],
                format: 'string',
            },
        ]
    },
    events
])

objectSections.set('#crdInstance#', [
    {
        name: 'properties',
        text: 'Properties',
        root: 'origin',
        items: [
            ...basicNamespaced,
            {
                name: 'source',
                text: 'Source',
                source: ['spec.source'],
                format: 'string',
            },
            {
                name: 'checksum',
                text: 'checksum',
                source: ['spec.checksum'],
                format: 'string',
                style: ['char:80']
            },
        ]
    },
    events
])
