import { AppsV1Api, BatchV1Api, CoreV1Api, NetworkingV1Api, V1Eviction, V1Job, V1Pod } from '@kubernetes/client-node'
import { ClusterInfo } from '../model/ClusterInfo'
import { v4 as uuid } from 'uuid'
const yaml = require('js-yaml')

async function getSelector(kind:string, namespace:string, name:string, clusterInfo:ClusterInfo) {
    try {
        switch(kind) {
            case 'Deployment': {
                    const res = await clusterInfo.appsApi.readNamespacedDeployment({name, namespace});
                    if (res.spec) return res.spec.selector.matchLabels;
                }
                break
            case 'ReplicaSet': {
                    const res = await clusterInfo.appsApi.readNamespacedReplicaSet({name, namespace})
                    if (res.spec) return res.spec.selector.matchLabels;
                }
                break
            case 'DaemonSet': {
                    const res = await clusterInfo.appsApi.readNamespacedDaemonSet({name, namespace});
                    if (res.spec) return res.spec.selector.matchLabels;
                }
                break
            case 'StatefulSet': {
                    const res = await clusterInfo.appsApi.readNamespacedStatefulSet({name, namespace});
                    if (res.spec) return res.spec.selector.matchLabels;
                }
                break
            case 'ReplicationController': {
                    const res = await clusterInfo.coreApi.readNamespacedReplicationController({name, namespace})
                    if (res.spec) return res.spec.selector; // RC usa .spec.selector directamente, no matchLabels
                }
                break
            case 'Job': {
                    const res = await clusterInfo.batchApi.readNamespacedJob({name, namespace})
                    if (res.spec && res.spec.selector) return res.spec.selector.matchLabels
                }
                break
        }
    }
    catch (err) {
        console.log('error getting info for restart', err)
        return undefined
    }
}

async function restartController (kind:string, namespace:string, name:string, clusterInfo:ClusterInfo) {
    try {
        const labels = await getSelector(kind, namespace, name, clusterInfo)
        if (labels) {
            const labelSelector = Object.entries(labels).map(([k, v]) => `${k}=${v}`).join(',');
            console.log(`Found selector: ${labelSelector}. Restrating pods...`);
            const pods = await clusterInfo.coreApi.listNamespacedPod({namespace, labelSelector})
            for (const pod of pods.items) {
                if (pod.metadata && pod.metadata.name) {
                    await clusterInfo.coreApi.deleteNamespacedPod({name:pod.metadata.name, namespace})
                    console.log(`Pod ${pod.metadata.name} deleted.`);
                }
            }
        }
    }
    catch (err) {
        console.log('Error restaring deployment', err)
    }
}

async function scaleController(kind:string, namespace:string, name:string, replicas:number, clusterInfo:ClusterInfo) {    
    try {
        const patch = [
            {
                op: "replace",
                path: "/spec/replicas",
                value: replicas
            }
        ]

        switch (kind) {
            case 'Deployment':
                await clusterInfo.appsApi.patchNamespacedDeployment({name, namespace, body: patch})
                break;
            case 'StatefulSet':
                await clusterInfo.appsApi.patchNamespacedStatefulSet({name, namespace, body: patch})
                break;
            case 'ReplicaSet':
                await clusterInfo.appsApi.patchNamespacedReplicaSet({name, namespace, body: patch})
                break;
            case 'ReplicationController':
                await clusterInfo.coreApi.patchNamespacedReplicationController({name, namespace, body:patch})
                break;
            default:
                break
        }
        console.log(`${kind} ${name} scaled to ${replicas}`)
    }
    catch (err) {
        console.error('Error scaling:', err)
    }
}

async function applyResource(resource:any, clusterInfo:ClusterInfo) : Promise<string> {
    try {
        const kind = resource.kind

        if (resource.metadata.managedFields) delete resource['metadata']['managedFields']
        await clusterInfo.objectsApi.patch(resource, undefined, undefined, 'kwirth', true, 'application/apply-patch+yaml')
        return `${kind} '${resource.metadata.name}' applied successfully.`
    }
    catch (err:any) {
        console.log('Error applying')
        console.log(err)
        return 'Error applying: '+err
    }
}

async function applyAllResources(yamlContent:string, clusterInfo:ClusterInfo): Promise<void> {
    //+++ test this with apply without splitting source
    try {
        const resources:any[] = []

        yaml.loadAll(yamlContent, (doc: any) => {
            resources.push(doc)
        })

        for (const resource of resources) {
            try {
                let result = await applyResource(resource, clusterInfo)
                if (result!=='') console.error(result)
            }
            catch (err) {
                console.log('Error applying resource:', err)
                break
            }
        }
    }
    catch (err) {
        console.log('Error applyig all resources')
        console.log(err)
    }
}

async function deleteAllResources(yamlContent: string, clusterInfo:ClusterInfo) : Promise<void> {
    try {
        const resources:any[] = []
        yaml.loadAll(yamlContent, (doc: any) => {
            resources.push(doc)
        })

        async function deleteResource(resource: any) {
            const kind = resource.kind
            const namespace = resource.metadata && resource.metadata.namespace

            switch (kind) {
                case 'Namespace':
                    console.log(`Removing Namespace: ${resource.metadata.name}`)
                    await clusterInfo.coreApi.deleteNamespace({ name: resource.metadata.name })
                    break

                case 'ConfigMap':
                    console.log(`Removing ConfigMap: ${resource.metadata.name}`)
                    await clusterInfo.coreApi.deleteNamespacedConfigMap({
                        name: resource.metadata.name,
                        namespace
                    })
                    break

                case 'Secret':
                    console.log(`Removing Secret: ${resource.metadata.name}`)
                    await clusterInfo.coreApi.deleteNamespacedSecret({
                        name: resource.metadata.name,
                        namespace
                    })
                    break

                case 'CustomResourceDefinition':
                    console.log(`Removing CRD: ${resource.metadata.name}`)
                    await clusterInfo.extensionApi.deleteCustomResourceDefinition({
                        name: resource.metadata.name
                    })
                    break

                case 'Deployment':
                    console.log(`Removing Deployment: ${resource.metadata.name}`)
                    await clusterInfo.appsApi.deleteNamespacedDeployment({
                        name: resource.metadata.name,
                        namespace
                    })
                    break

                case 'Service':
                    console.log(`Removing Service: ${resource.metadata.name}`)
                    await clusterInfo.coreApi.deleteNamespacedService({
                        name: resource.metadata.name,
                        namespace
                    })
                    break

                case 'ClusterRole':
                    console.log(`Removing ClusterRole: ${resource.metadata.name}`)
                    await clusterInfo.rbacApi.deleteClusterRole({
                        name: resource.metadata.name
                    })
                    break

                case 'ClusterRoleBinding':
                    console.log(`Removing ClusterRoleBinding: ${resource.metadata.name}`)
                    await clusterInfo.rbacApi.deleteClusterRoleBinding({
                        name: resource.metadata.name,
                    })
                    break

                case 'RoleBinding':
                    console.log(`Removing RoleBinding: ${resource.metadata.name}`)
                    await clusterInfo.rbacApi.deleteNamespacedRoleBinding({
                        name: resource.metadata.name,
                        namespace
                    })
                    break

                case 'ServiceAccount':
                    console.log(`Removing ServiceAccount: ${resource.metadata.name}`)
                    await clusterInfo.coreApi.deleteNamespacedServiceAccount({
                        name: resource.metadata.name,
                        namespace
                    })
                    break

                default:
                    console.log(`Resource ${kind} not implementaded.`)
                    break
            }
            console.log(`${kind} succcessfully removed.`)
        }

        for (const resource of resources) {
            try {
                await deleteResource(resource)
            }
            catch (err) {
                console.log('Error removing resource:', err)
                break
            }
        }
    }
    catch (err) {
        console.log('Error deleting resource')
        console.log(err)
    }
}

async function nodeSetSchedulable(coreApi: CoreV1Api, nodeName: string, unschedulable: boolean): Promise<void> {
    try {
        const patch = [
            {
                op: "replace",
                path: "/spec/unschedulable",
                value: unschedulable
            }
        ]
        await coreApi.patchNode({
            name: nodeName,
            body: patch
        })
        console.log(`Node ${nodeName}: unschedulable = ${unschedulable}`);
    }
    catch (err: any) {
        console.error(`Error in patchNode: ${err.body?.message || err.message}`)
    }
}

async function nodeShell(coreApi: CoreV1Api, nodeName: string, podNamespace:string, podName:string): Promise<void> {
    try {
        let podDefinition:V1Pod = {
            "apiVersion": "v1",
            "kind": "Pod",
            "metadata": {
                "name": podName,
                "namespace": podNamespace
            },
            "spec": {
                "containers": [
                    {
                        "name": "debugger",
                        "image": "alpine",
                        "command": [ "/bin/sh", "-c" ],
                        "args": [
                            "if [ -S \"/host-run/k3s/containerd/containerd.sock\" ]; then\n    S=\"/host-run/k3s/containerd/containerd.sock\"\nelif [ -S \"/host-run/containerd/containerd.sock\" ]; then\n    S=\"/host-run/containerd/containerd.sock\"\nelif [ -S \"/host-run/crio/crio.sock\" ]; then\n    S=\"/host-run/crio/crio.sock\"\nelif [ -S \"/host-var-run/containerd/containerd.sock\" ]; then\n    S=\"/host-var-run/containerd/containerd.sock\"\nfi\nif [ -n \"$S\" ]; then\n    export CONTAINER_RUNTIME_ENDPOINT=\"unix://$S\"\n    export IMAGE_SERVICE_ENDPOINT=\"unix://$S\"\n    echo \"Socket detected in $S.\"\nelse\n    echo \"ERROR: CRI runtime socket not found.\"\nfi\nsleep 3600\n"
                        ],
                        "securityContext": {
                            "privileged": true
                        },
                        "volumeMounts": [
                            {
                                "name": "host-root",
                                "mountPath": "/host"
                            },
                            {
                                "name": "run-host",
                                "mountPath": "/host-run"
                            },
                            {
                                "name": "var-run-host",
                                "mountPath": "/host-var-run"
                            },
                            {
                                "name": "usr-bin",
                                "mountPath": "/host-usr-bin"
                            }
                        ]
                    }
                ],
                "nodeName": nodeName,
                "hostNetwork": true,
                "hostPID": true,
                "hostIPC": true,
                "volumes": [
                    {
                        "name": "host-root",
                        "hostPath": { "path": "/" }
                    },
                    {
                        "name": "run-host",
                        "hostPath": { "path": "/run" }
                    },
                    {
                        "name": "var-run-host",
                        "hostPath": { "path": "/var/run" }
                    },
                    {
                        "name": "usr-bin",
                        "hostPath": { "path": "/usr/bin" }
                    }
                ]
            }
        }
        const response = await coreApi.createNamespacedPod({
            namespace: podNamespace,
            body: podDefinition
        })
    }
    catch (err) {
        console.log('Error in cordon')
        console.log(err)
    }
}

async function nodeCordon(coreApi: CoreV1Api, nodeName: string): Promise<void> {
    try {
        await nodeSetSchedulable(coreApi, nodeName, true)
    }
    catch (err) {
        console.log('Error in cordon')
        console.log(err)
    }
}

async function nodeUnCordon(coreApi: CoreV1Api, nodeName: string): Promise<void> {
    try {
    await nodeSetSchedulable(coreApi, nodeName, false)
    }
    catch (err) {
        console.log('Error in uncordon')
        console.log(err)
    }
}

async function nodeDrain(coreApi: CoreV1Api, nodeName: string): Promise<void> {
    try {
        await nodeSetSchedulable(coreApi, nodeName, true);

        let result = await coreApi.listPodForAllNamespaces({ fieldSelector: `spec.nodeName=${nodeName}` })

        const evictionPromises = result.items.map(async (pod) => {
            const name = pod.metadata?.name
            const namespace = pod.metadata?.namespace

            if (!name || !namespace) return

            // omissions
            const isDaemonSet = pod.metadata?.ownerReferences?.some( ref => ref.kind === 'DaemonSet' )
            const isStaticPod = pod.metadata?.annotations?.['kubernetes.io/config.mirror']
            
            if (isDaemonSet || isStaticPod) {
                console.log(`Omit system pod: ${name}`)
                return
            }
            await podEvict(coreApi, namespace, name)
        })

        await Promise.all(evictionPromises)
        console.log(`Drain completed for node ${nodeName}`)

    }
    catch (err: any) {
        console.error(`Error draininig node ${nodeName}: ${err.message}`)
    }
}

async function throttleExcute(id:string, invoke:any): Promise<boolean> {
    let repeat = true
    let retry = 3
    while (repeat) {
        repeat = false
        try {
            await invoke()
            return true
        }
        catch (err:any) {
            console.log('Throttling error on',id)
            if (err.code === 429) {
                repeat = true
                await new Promise ( (resolve) => { setTimeout(resolve, (+err.headers['retry-after']||1)*1000)})
            }
            else {
                // unknown error just retry
                retry--
                console.log('Error when throttling', id, err)
                if (retry>0) await new Promise ( (resolve) => { setTimeout(resolve, 3000)})
                return false
            }
        }
    }
    console.log('Unexpected error when throttling', id)
    return false
}

async function cronJobTrigger (namespace: string, cronJobName: string, batchApi: BatchV1Api): Promise<void> {
    try {
        const cronJob = await batchApi.readNamespacedCronJob({
            name: cronJobName,
            namespace: namespace
        })

        if (!cronJob.spec?.jobTemplate) {
            throw new Error("El CronJob no tiene un jobTemplate definido.");
        }

        const manualJobName = `${cronJobName}-manual-${Math.floor(Date.now() / 1000)}`;
        const jobManifest: V1Job = {
            metadata: {
                name: manualJobName,
                labels: { 'triggered-by': 'node-client' }
            },
            spec: cronJob.spec.jobTemplate.spec
        };

        await batchApi.createNamespacedJob({
            namespace: namespace,
            body: jobManifest
        })

        console.log(`✅ Manual Job created: ${manualJobName}`);
    } 
    catch (err: any) {
        console.error('❌ Error launching CronJob:', err.response?.body?.message || err.message);
    }
}    

async function cronJobStatus(namespace: string, cronJobName: string, suspend: boolean, batchApi: BatchV1Api): Promise<void> {
    try {
        const patch = [
            {
                op: "replace",
                path: "/spec/suspend",
                value: suspend
            }
        ]
        await batchApi.patchNamespacedCronJob({
            name: cronJobName,
            namespace,
            body: patch
        })

        console.log(`✅ CronJob "${cronJobName}" ${suspend ? 'suspended' : 'activated'} succesfully.`);
    }
    catch (err: any) {
        console.error('❌ Error patching CronJob:', err.response?.body?.message || err.message);
    }
}

async function podEvict (coreApi: CoreV1Api, namespace: string, name:string): Promise<void> {
    const body: V1Eviction = {
        apiVersion: 'policy/v1',
        kind: 'Eviction',
        metadata: {
            name: name,
            namespace: namespace,
        }
    }

    try {
        await coreApi.createNamespacedPodEviction({name, namespace, body })
        console.log(`Eviction succesful for ${name}`);
    }
    catch (err: any) {
        console.error('Error evicting:', err.response?.body?.message || err.message);
    }
}

async function podWork (coreApi: CoreV1Api, work: string): Promise<string|undefined> {
    const podDefinition:V1Pod = {
        metadata: {
            name: 'kwirth-ubuntu-pod',
        },
        spec: {
            containers: [
                {
                    name: 'kwirth-container',
                    image: 'ubuntu:latest',
                    command: ['sleep', 'infinity'],
                    imagePullPolicy: 'Always'
                },
            ],
        },
    }

    switch (work) {
        case 'ubuntu':
            break
        case 'alpine':
            podDefinition!.metadata!.name = 'kwirth-alpine-pod'
            podDefinition!.spec!.containers[0].image = 'alpine:latest'
            break
        case 'dnsutils':
            podDefinition!.metadata!.name = 'kwirth-dnsutils-pod'
            podDefinition!.spec!.containers[0].image = 'tutum/dnsutils'
            break
        case 'jubuntu':
            podDefinition!.metadata!.name = 'kwirth-jubuntu-pod'
            podDefinition!.spec!.containers[0].image = 'jfvilasoutlook/jubuntu'
            break
        default:
            return undefined
    }

    try {
        const response = await coreApi.createNamespacedPod({
            namespace:'default',
            body:podDefinition
        })

        let isRunning = false
        while (!isRunning) {
            try {
                const res = await coreApi.readNamespacedPodStatus({
                    name: podDefinition!.metadata!.name!,
                    namespace:'default'
                });
                const phase = res.status?.phase;                
                if (phase === 'Running') {
                    isRunning = true
                    break
                }
            }
            catch (e) {
                console.log('Waiting for pod...')
            }
            await new Promise(resolve => setTimeout(resolve, 2000))
        }
        return podDefinition!.metadata!.name
    }
    catch (err: any) {
        console.error('Error evicting:', err.response?.body?.message || err.message);
    }
    return undefined
}

async function setIngressClassAsDefault (networkApi: NetworkingV1Api, name:string) {
    const patch = {
        op: 'replace',
        path: '/metadata/annotations',
        value: {
            'ingressclass.kubernetes.io/is-default-class': 'true'
        }
    }
    try {
        await networkApi.patchIngressClass({ name: name, body: [patch]})
        console.log(`✅ IngressClass "${name}" set as default.`)
    }
    catch (err) {
        console.error('Error al pathing igress class IngressClass:', err)
    }        
}

async function imageDelete(appsApi: AppsV1Api, imageName: string) {
    const safeImageName = imageName.replace(/[^a-zA-Z0-9.\/_:@-]/g, '');
    const uniqueId = uuid().substring(0, 8);
    const uniqueName = `kwirth-image-purger-${uniqueId}`;

    const daemonSet = {
        metadata: {
            name: uniqueName,
            labels: { app: 'image-purger', id: uniqueId }
        },
        spec: {
            selector: { matchLabels: { app: uniqueName } },
            template: {
                metadata: { labels: { app: uniqueName } },
                spec: {
                    tolerations: [
                        { operator: "Exists", effect: "NoSchedule" },
                        { operator: "Exists", effect: "NoExecute" }
                    ],
                    hostPID: true, // Necesario para interactuar con procesos del host
                    containers: [{
                        name: 'worker',
                        //image: 'rancher/crictl:v1.19.0',
                        //image: 'dojobits/crictl:v1.19.0',  
                        image: 'kwirthmagnify/crictl',
                        command: ["/bin/sh", "-c"],
                        args: [`
                            if [ -S "/host-run/k3s/containerd/containerd.sock" ]; then
                                S="/host-run/k3s/containerd/containerd.sock"
                            elif [ -S "/host-run/containerd/containerd.sock" ]; then
                                S="/host-run/containerd/containerd.sock"
                            elif [ -S "/host-run/crio/crio.sock" ]; then
                                S="/host-run/crio/crio.sock"
                            elif [ -S "/host-var-run/containerd/containerd.sock" ]; then
                                S="/host-var-run/containerd/containerd.sock"
                            fi

                            if [ -n "$S" ]; then
                                export CONTAINER_RUNTIME_ENDPOINT="unix://$S"
                                export IMAGE_SERVICE_ENDPOINT="unix://$S"
                                echo "Socket detected in $S. Removing ${safeImageName}..."
                                /usr/local/bin/crictl rmi "${safeImageName}" || echo "La imagen no existe en este nodo."
                            else
                                echo "ERROR: Runtime socket not found in /host-run nor /host-var-run"
                                exit 1
                            fi

                            sleep 50
                        `.trim()],
                        securityContext: { 
                            privileged: true,
                            runAsUser: 0 
                        },
                        volumeMounts: [
                            { 
                                name: 'run-host', 
                                mountPath: '/host-run', 
                                mountPropagation: 'HostToContainer' 
                            },
                            { 
                                name: 'var-run-host', 
                                mountPath: '/host-var-run', 
                                mountPropagation: 'HostToContainer' 
                            }
                        ]
                    }],
                    volumes: [
                        { 
                            name: 'run-host', 
                            hostPath: { path: '/run', type: 'Directory' } 
                        },
                        { 
                            name: 'var-run-host', 
                            hostPath: { path: '/var/run', type: 'Directory' } 
                        }
                    ]
                }
            }
        }
    }

    try {
        await appsApi.createNamespacedDaemonSet({
            namespace: 'default',
            body: daemonSet
        });
        console.log(`[${uniqueName}] DaemonSet created, waiting for node cleaning...`);

        await new Promise((resolve) => setTimeout(resolve, 60000));

        await appsApi.deleteNamespacedDaemonSet({
            name: uniqueName,
            namespace: 'default'
        });
        console.log(`[${uniqueName}] Image deleted and DaemonSet removed.`);
        
    } catch (err: any) {
        console.error('Error running imageDelete:', err.response?.body || err.message);
        
        try {
            await appsApi.deleteNamespacedDaemonSet({
                name: uniqueName,
                namespace: 'default'
            });
        }
        catch { }
    }
}

// async function imageDeleteOld (appsApi:AppsV1Api, imageName:string) {
//     // +++ TEST OTHER Kubes

//     /*
//         /run/containerd/containerd.sock
//         /run/k3s/containerd/containerd.sock
//         /var/snap/microk8s/common/run/containerd.sock
//         /run/containerd/containerd.sock (dentro del contenedor nodo)
//         /run/dockershim.sock

//         export CONTAINER_RUNTIME_ENDPOINT=unix:///run/containerd/containerd.sock    
//     */
//     let uniqueName = 'kwirth-image-purger-'+uuid()

//     const daemonSet = {
//         metadata: {
//             name: uniqueName,
//             labels: { app: uniqueName }
//         },
//         spec: {
//             selector: { matchLabels: { app: uniqueName } },
//             template: {
//                 metadata: { labels: { app: uniqueName } },
//                 spec: {
//                     containers: [{
//                         name: 'worker',
//                         image: 'rancher/crictl:v1.19.0',
//                         command: ["/bin/sh", "-c"],
//                         args: [`/usr/local/bin/crictl rmi ${imageName} && sleep 10`],
//                         securityContext: { privileged: true },
//                         volumeMounts: [
//                             { name: 'cri-k3s-socket', mountPath: '/run/containerd/containerd.sock' }
//                         ]
//                     }],
//                     volumes: [
//                         { name: 'cri-k3s-socket', hostPath: { path: '/run/k3s/containerd/containerd.sock' } }
//                     ],
//                     hostPID: true
//                 }
//             }
//         }
//     }

//     try {
//         await appsApi.createNamespacedDaemonSet({
//             namespace: 'default',
//             body: daemonSet
//         })
//         console.log(`DaemonSet ${uniqueName} created for deleting image '${imageName}'`);
//         await new Promise((resolve) => setTimeout(resolve, 30000))
//         await appsApi.deleteNamespacedDaemonSet({
//             namespace: 'default',
//             name: uniqueName
//         })
//     }
//     catch (err:any) {
//         console.error('Error:', err.response ? err.response.body : err);
//     }
// }

export { applyResource, applyAllResources, deleteAllResources, nodeShell, nodeDrain, nodeCordon, nodeUnCordon, throttleExcute, cronJobStatus, cronJobTrigger, podEvict, setIngressClassAsDefault, restartController, scaleController, imageDelete, podWork }