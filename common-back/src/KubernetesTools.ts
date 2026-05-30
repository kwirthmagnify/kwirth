const jsYaml = require('js-yaml')
const k8s = require('@kubernetes/client-node')

async function applyResource(resource: any, clusterInfo: any): Promise<string> {
    try {
        if (resource.metadata?.managedFields) delete resource.metadata.managedFields
        await clusterInfo.objectsApi.patch(resource, undefined, undefined, 'kwirth', true, 'application/apply-patch+yaml')
        return `${resource.kind} '${resource.metadata?.name}' applied successfully.`
    } catch (err: any) {
        console.log('[KubernetesTools] Error applying:', err)
        return 'Error applying: ' + err
    }
}

export async function applyAllResources(yamlContent: string, clusterInfo: any): Promise<void> {
    try {
        const resources: any[] = []
        jsYaml.loadAll(yamlContent, (doc: any) => { if (doc) resources.push(doc) })
        for (const resource of resources) {
            try {
                const result = await applyResource(resource, clusterInfo)
                if (result !== '') console.log('[KubernetesTools]', result)
            } catch (err) {
                console.log('[KubernetesTools] Error applying resource:', err)
                break
            }
        }
    } catch (err) {
        console.log('[KubernetesTools] Error applying all resources:', err)
    }
}

export async function deleteAllResources(yamlContent: string, clusterInfo: any): Promise<void> {
    async function deleteResource(resource: any) {
        const kind = resource.kind
        const name = resource.metadata?.name
        const namespace = resource.metadata?.namespace
        try {
            switch (kind) {
                case 'Namespace':
                    await clusterInfo.coreApi.deleteNamespace({ name }); break
                case 'ConfigMap':
                    await clusterInfo.coreApi.deleteNamespacedConfigMap({ name, namespace }); break
                case 'Secret':
                    await clusterInfo.coreApi.deleteNamespacedSecret({ name, namespace }); break
                case 'CustomResourceDefinition':
                    await clusterInfo.extensionApi.deleteCustomResourceDefinition({ name }); break
                case 'Deployment':
                    await clusterInfo.appsApi.deleteNamespacedDeployment({ name, namespace }); break
                case 'Service':
                    await clusterInfo.coreApi.deleteNamespacedService({ name, namespace }); break
                case 'ClusterRole':
                    await clusterInfo.rbacApi.deleteClusterRole({ name }); break
                case 'ClusterRoleBinding':
                    await clusterInfo.rbacApi.deleteClusterRoleBinding({ name }); break
                case 'RoleBinding':
                    await clusterInfo.rbacApi.deleteNamespacedRoleBinding({ name, namespace }); break
                case 'ServiceAccount':
                    await clusterInfo.coreApi.deleteNamespacedServiceAccount({ name, namespace }); break
                default:
                    console.log(`[KubernetesTools] Resource kind '${kind}' not implemented for deletion.`)
                    return
            }
            console.log(`[KubernetesTools] ${kind} '${name}' removed.`)
        } catch (err) {
            console.log(`[KubernetesTools] Error removing ${kind} '${name}':`, err)
        }
    }

    try {
        const resources: any[] = []
        jsYaml.loadAll(yamlContent, (doc: any) => { if (doc) resources.push(doc) })
        for (const resource of resources) {
            try { await deleteResource(resource) } catch (err) {
                console.log('[KubernetesTools] Error deleting resource:', err)
                break
            }
        }
    } catch (err) {
        console.log('[KubernetesTools] Error deleting all resources:', err)
    }
}

async function getSelector(kind: string, namespace: string, name: string, clusterInfo: any): Promise<Record<string, string> | undefined> {
    try {
        switch (kind) {
            case 'Deployment':    return (await clusterInfo.appsApi.readNamespacedDeployment({ name, namespace })).spec?.selector?.matchLabels
            case 'ReplicaSet':    return (await clusterInfo.appsApi.readNamespacedReplicaSet({ name, namespace })).spec?.selector?.matchLabels
            case 'DaemonSet':     return (await clusterInfo.appsApi.readNamespacedDaemonSet({ name, namespace })).spec?.selector?.matchLabels
            case 'StatefulSet':   return (await clusterInfo.appsApi.readNamespacedStatefulSet({ name, namespace })).spec?.selector?.matchLabels
            case 'ReplicationController': return (await clusterInfo.coreApi.readNamespacedReplicationController({ name, namespace })).spec?.selector
            case 'Job':           return (await clusterInfo.batchApi.readNamespacedJob({ name, namespace })).spec?.selector?.matchLabels
        }
    } catch (err) {
        console.log('[KubernetesTools] Error getting selector:', err)
    }
    return undefined
}

export interface ICrdInformerHandlers {
    onAdd?: (obj: any) => void
    onUpdate?: (obj: any) => void
    onDelete?: (obj: any) => void
    onError?: (err: any) => void
}

export function createCrdInformer(clusterInfo: any, apiGroup: string, apiVersion: string, plural: string, handlers: ICrdInformerHandlers): any {
    const path = `/apis/${apiGroup}/${apiVersion}/${plural}`
    const listFunction = () =>
        clusterInfo.crdApi.listCustomObjectForAllNamespaces({ group: apiGroup, version: apiVersion, plural })
            .then((res: any) => res as { items: any[] })
    const informer = k8s.makeInformer(clusterInfo.kubeConfig, path, listFunction)
    if (handlers.onAdd)    informer.on('add',    handlers.onAdd)
    if (handlers.onUpdate) informer.on('update', handlers.onUpdate)
    if (handlers.onDelete) informer.on('delete', handlers.onDelete)
    if (handlers.onError)  informer.on('error',  handlers.onError)
    return informer
}

export async function restartController(kind: string, namespace: string, name: string, clusterInfo: any): Promise<void> {
    try {
        const labels = await getSelector(kind, namespace, name, clusterInfo)
        if (labels) {
            const labelSelector = Object.entries(labels).map(([k, v]) => `${k}=${v}`).join(',')
            const pods = await clusterInfo.coreApi.listNamespacedPod({ namespace, labelSelector })
            for (const pod of pods.items) {
                if (pod.metadata?.name) {
                    await clusterInfo.coreApi.deleteNamespacedPod({ name: pod.metadata.name, namespace })
                    console.log(`[KubernetesTools] Pod ${pod.metadata.name} deleted.`)
                }
            }
        }
    } catch (err) {
        console.log('[KubernetesTools] Error restarting controller:', err)
    }
}
