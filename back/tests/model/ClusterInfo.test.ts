// Deteccion del nombre de cluster. Kubernetes no publica ninguno, asi que la precedencia es
// KWIRTH_CLUSTER_NAME > heuristica por flavour > uid del namespace kube-system.

import test from 'node:test'
import assert from 'node:assert/strict'
import { V1Node } from '@kubernetes/client-node'
import { ClusterInfo } from '../../src/model/ClusterInfo'

const KUBE_SYSTEM_UID = 'b7c1f0de-1111-2222-3333-444455556666'

interface INodeSpec {
    name: string
    labels?: Record<string, string>
    annotations?: Record<string, string>
    providerID?: string
    controlPlane?: boolean
}

const node = (spec: INodeSpec): V1Node => ({
    metadata: {
        name: spec.name,
        labels: { ...(spec.labels ?? {}), ...(spec.controlPlane ? { 'node-role.kubernetes.io/control-plane': 'true' } : {}) },
        annotations: spec.annotations ?? {}
    },
    spec: spec.providerID ? { providerID: spec.providerID } : {}
}) as V1Node

// ClusterInfo solo necesita coreApi para esto: listNode + readNamespace('kube-system')
const clusterInfoWith = (nodes: V1Node[] | Error) => {
    const calls = { listNode: 0, readNamespace: 0 }
    const ci = new ClusterInfo()
    ci.coreApi = {
        listNode: async () => {
            calls.listNode++
            if (nodes instanceof Error) throw nodes
            return { items: nodes }
        },
        readNamespace: async ({ name }: { name: string }) => {
            calls.readNamespace++
            assert.equal(name, 'kube-system')
            return { metadata: { uid: KUBE_SYSTEM_UID } }
        }
    } as never
    return { ci, calls }
}

const withEnvName = (t: { after: (fn: () => void) => void }, value: string) => {
    const previous = process.env.KWIRTH_CLUSTER_NAME
    process.env.KWIRTH_CLUSTER_NAME = value
    t.after(() => {
        if (previous === undefined) delete process.env.KWIRTH_CLUSTER_NAME
        else process.env.KWIRTH_CLUSTER_NAME = previous
    })
}

const aksNode = node({
    name: 'aks-agentpool-1', controlPlane: true,
    labels: {
        'kubernetes.azure.com/cluster': 'MC_rg-shop-prod_shop-prod_westeurope',
        'kubernetes.azure.com/network-resourcegroup': 'MC_rg-shop-prod'
    }
})

test('KWIRTH_CLUSTER_NAME wins over any heuristic', async (t) => {
    withEnvName(t, 'my-own-name')
    const { ci } = clusterInfoWith([aksNode])
    await ci.setKubernetesClusterName()

    assert.equal(ci.name, 'my-own-name')
    assert.equal(ci.flavour, 'aks', 'the flavour is still detected')
})

test('KWIRTH_CLUSTER_NAME is ignored when blank', async (t) => {
    withEnvName(t, '   ')
    const { ci } = clusterInfoWith([aksNode])
    await ci.setKubernetesClusterName()

    assert.equal(ci.name, 'shop-prod_westeurope')
})

test('aks: the node resource group prefix is stripped', async () => {
    const { ci } = clusterInfoWith([aksNode])
    await ci.setKubernetesClusterName()

    assert.equal(ci.flavour, 'aks')
    assert.equal(ci.name, 'shop-prod_westeurope')
})

test('aks: without the resourcegroup label the label is kept whole', async () => {
    const { ci } = clusterInfoWith([node({ name: 'aks-1', labels: { 'kubernetes.azure.com/cluster': 'MC_rg_shop_westeurope' } })])
    await ci.setKubernetesClusterName()

    assert.equal(ci.name, 'MC_rg_shop_westeurope', 'no undefined_ prefix must be cut')
})

test('eks: the karpenter discovery tag names the cluster', async () => {
    const lastApplied = JSON.stringify({ spec: { tags: { 'karpenter.sh/discovery': 'shop-eks' } } })
    const { ci } = clusterInfoWith([node({
        name: 'ip-10-0-0-1', controlPlane: true,
        labels: { 'k8s.io/cloud-provider-aws': 'x' },
        annotations: { 'kubectl.kubernetes.io/last-applied-configuration': lastApplied }
    })])
    await ci.setKubernetesClusterName()

    assert.equal(ci.flavour, 'eks')
    assert.equal(ci.name, 'shop-eks')
})

test('eks: falls back to the eksctl label of any other node', async () => {
    const { ci } = clusterInfoWith([
        node({ name: 'ip-10-0-0-1', controlPlane: true, labels: { 'k8s.io/cloud-provider-aws': 'x' } }),
        node({ name: 'ip-10-0-0-2', labels: { 'alpha.eksctl.io/cluster-name': 'shop-eksctl' } })
    ])
    await ci.setKubernetesClusterName()

    assert.equal(ci.name, 'shop-eksctl')
})

test('eks: an unparseable last-applied-configuration does not break the fallback', async () => {
    const { ci } = clusterInfoWith([
        node({
            name: 'ip-10-0-0-1', controlPlane: true,
            labels: { 'k8s.io/cloud-provider-aws': 'x' },
            annotations: { 'kubectl.kubernetes.io/last-applied-configuration': '{not json' }
        }),
        node({ name: 'ip-10-0-0-2', labels: { 'alpha.eksctl.io/cluster-name': 'shop-eksctl' } })
    ])
    await ci.setKubernetesClusterName()

    assert.equal(ci.name, 'shop-eksctl')
})

test('gke: the cluster comes out of the providerID node name', async () => {
    const { ci } = clusterInfoWith([node({
        name: 'gke-shop-default-pool-1a2b3c4d-xyz1', controlPlane: true,
        providerID: 'gce://my-project/europe-west1-b/gke-shop-default-pool-1a2b3c4d-xyz1'
    })])
    await ci.setKubernetesClusterName()

    assert.equal(ci.flavour, 'gke')
    // La heuristica de gke recorta los dos ultimos segmentos del nombre del nodo, asi que el
    // nodepool se queda pegado al nombre del cluster ('shop' + 'default-pool'). Imprecision
    // preexistente: se documenta aqui tal cual es, sin cambiarla
    assert.equal(ci.name, 'shop-default-pool')
})

test('k3d: the cluster is the node name up to the -server- separator', async () => {
    const { ci } = clusterInfoWith([node({
        name: 'k3d-kwirth-server-0', controlPlane: true,
        annotations: { 'k3s.io/hostname': 'k3d-kwirth-server-0' }
    })])
    await ci.setKubernetesClusterName()

    assert.equal(ci.flavour, 'k3d')
    assert.equal(ci.name, 'k3d-kwirth')
})

test('k3s: a plain hostname is the cluster name, not an empty string', async () => {
    const { ci } = clusterInfoWith([node({
        name: 'nodo1', controlPlane: true,
        annotations: { 'k3s.io/hostname': 'nodo1' }
    })])
    await ci.setKubernetesClusterName()

    assert.equal(ci.flavour, 'k3s')
    assert.equal(ci.name, 'nodo1')
})

test('k3s: the control plane names the cluster, not whichever node comes first', async () => {
    const { ci } = clusterInfoWith([
        node({ name: 'agente2', annotations: { 'k3s.io/hostname': 'agente2' } }),
        node({ name: 'nodo1', controlPlane: true, annotations: { 'k3s.io/hostname': 'nodo1' } })
    ])
    await ci.setKubernetesClusterName()

    assert.equal(ci.name, 'nodo1')
})

test('k3s: a hostname that looks like k3d is not cut', async () => {
    const { ci } = clusterInfoWith([node({
        name: 'prod-server-01', controlPlane: true,
        annotations: { 'k3s.io/hostname': 'prod-server-01' }
    })])
    await ci.setKubernetesClusterName()

    assert.equal(ci.name, 'prod-server-01', 'only k3d node names carry the separator')
})

test('a cluster with no clues at all falls back to the kube-system uid', async () => {
    const { ci, calls } = clusterInfoWith([node({ name: 'bare-node', controlPlane: true })])
    await ci.setKubernetesClusterName()

    assert.equal(ci.name, KUBE_SYSTEM_UID)
    assert.equal(ci.flavour, 'unknown')
    assert.equal(calls.readNamespace, 1)
})

test('an empty node list falls back to the kube-system uid', async () => {
    const { ci } = clusterInfoWith([])
    await ci.setKubernetesClusterName()

    assert.equal(ci.name, KUBE_SYSTEM_UID)
})

test('a failing node list falls back to the kube-system uid', async () => {
    const { ci } = clusterInfoWith(new Error('forbidden'))
    await ci.setKubernetesClusterName()

    assert.equal(ci.name, KUBE_SYSTEM_UID)
})

test('the already known cluster id is reused instead of asking again', async () => {
    const { ci, calls } = clusterInfoWith([node({ name: 'bare-node' })])
    ci.id = 'already-known-uid'
    await ci.setKubernetesClusterName()

    assert.equal(ci.name, 'already-known-uid')
    assert.equal(calls.readNamespace, 0)
})

test('an already resolved name is never recomputed', async () => {
    const { ci, calls } = clusterInfoWith([aksNode])
    ci.name = 'set-by-someone-else'
    await ci.setKubernetesClusterName()

    assert.equal(ci.name, 'set-by-someone-else')
    assert.equal(calls.listNode, 0, 'no api call at all')
})
