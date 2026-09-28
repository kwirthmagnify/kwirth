// Detecting the cluster's name. Kubernetes publishes none, so the precedence is KWIRTH_CLUSTER_NAME >
// a flavour heuristic > the uid of the kube-system namespace.

import test from 'node:test'
import assert from 'node:assert/strict'
import { V1Node } from '@kubernetes/client-node'
import { EClusterFlavour, ERancherRole } from '@kwirthmagnify/kwirth-common'
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

/*
    ClusterInfo needs coreApi for this (listNode + readNamespace('kube-system')) and, since 2026-09-28,
    appsApi to look for Rancher's agent in cattle-system. `cattleDeployments` is what that namespace
    holds; leaving it out makes the lookup throw, which is exactly what happens on a cluster with no
    cattle-system at all, and must degrade to "no Rancher" rather than break the name detection.
*/
const clusterInfoWith = (nodes: V1Node[] | Error, cattleDeployments?: string[]) => {
    const calls = { listNode: 0, readNamespace: 0 }
    const ci = new ClusterInfo()
    ci.appsApi = {
        listNamespacedDeployment: async ({ namespace }: { namespace: string }) => {
            assert.equal(namespace, 'cattle-system')
            if (!cattleDeployments) throw new Error('namespaces "cattle-system" not found')
            return { items: cattleDeployments.map(name => ({ metadata: { name } })) }
        }
    } as never
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
    assert.equal(ci.flavour, EClusterFlavour.AKS, 'the flavour is still detected')
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

    assert.equal(ci.flavour, EClusterFlavour.AKS)
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

    assert.equal(ci.flavour, EClusterFlavour.EKS)
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

    assert.equal(ci.flavour, EClusterFlavour.GKE)
    // The gke heuristic trims the node name's last two segments, so the nodepool stays stuck to the
    // cluster's name ('shop' + 'default-pool'). A pre-existing imprecision: it is documented here exactly
    // as it is, without changing it
    assert.equal(ci.name, 'shop-default-pool')
})

test('k3d: the cluster is the node name up to the -server- separator', async () => {
    const { ci } = clusterInfoWith([node({
        name: 'k3d-kwirth-server-0', controlPlane: true,
        annotations: { 'k3s.io/hostname': 'k3d-kwirth-server-0' }
    })])
    await ci.setKubernetesClusterName()

    assert.equal(ci.flavour, EClusterFlavour.K3D)
    assert.equal(ci.name, 'k3d-kwirth')
})

test('k3s: a plain hostname is the cluster name, not an empty string', async () => {
    const { ci } = clusterInfoWith([node({
        name: 'nodo1', controlPlane: true,
        annotations: { 'k3s.io/hostname': 'nodo1' }
    })])
    await ci.setKubernetesClusterName()

    assert.equal(ci.flavour, EClusterFlavour.K3S)
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
    assert.equal(ci.flavour, EClusterFlavour.UNKNOWN)
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

// ── SUSE distributions (S1 of the suse-stack) ────────────────────────────────────────────────────────
//
// ⚠️ RKE2 and Harvester are NOT verified against a real cluster: there is none available yet, and their
// clues come from the distributions' documentation. These tests pin down the CONTRACT (what we do with
// each clue), not that the clue is the right one -- that gets re-checked when a Rancher shows up.

test('rke2: detected by its own annotation', async () => {
    const { ci } = clusterInfoWith([node({
        name: 'rke2-server-1', controlPlane: true,
        annotations: { 'rke2.io/hostname': 'rke2-server-1', 'rke2.io/node-args': '["server"]' }
    })])
    await ci.setKubernetesClusterName()
    assert.equal(ci.flavour, EClusterFlavour.RKE2)
})

test('rke2: also detected by the +rke2 suffix of the kubelet version', async () => {
    const n = node({ name: 'worker-1', controlPlane: true })
    n.status = { nodeInfo: { kubeletVersion: 'v1.31.5+rke2r1' } } as never
    const { ci } = clusterInfoWith([n])
    await ci.setKubernetesClusterName()
    assert.equal(ci.flavour, EClusterFlavour.RKE2)
})

test('rke2: a Rancher-managed one takes its name from the cattle label', async () => {
    const { ci } = clusterInfoWith([node({
        name: 'rke2-server-1', controlPlane: true,
        labels: { 'cattle.io/cluster-name': 'prod-bcn' },
        annotations: { 'rke2.io/hostname': 'rke2-server-1' }
    })])
    await ci.setKubernetesClusterName()
    assert.equal(ci.name, 'prod-bcn')
})

test('harvester: wins over rke2, because it RUNS on rke2', async () => {
    // A Harvester node carries the rke2 clues too. Asking for rke2 first would label every Harvester
    // as plain rke2, and the order in the code is what prevents it.
    const { ci } = clusterInfoWith([node({
        name: 'harvester-node-1', controlPlane: true,
        labels: { 'harvesterhci.io/managed': 'true', 'harvesterhci.io/cluster-name': 'hci-01' },
        annotations: { 'rke2.io/hostname': 'harvester-node-1' }
    })])
    await ci.setKubernetesClusterName()
    assert.equal(ci.flavour, EClusterFlavour.HARVESTER)
    assert.equal(ci.name, 'hci-01')
})

// ── Rancher ──────────────────────────────────────────────────────────────────────────────────────────

test('rancher: the cluster it runs on is the local one', async () => {
    const { ci } = clusterInfoWith([aksNode], ['rancher', 'cattle-cluster-agent', 'rancher-webhook'])
    await ci.setKubernetesClusterName()
    assert.equal(ci.rancherManaged, true)
    assert.equal(ci.rancherRole, ERancherRole.LOCAL)
})

test('rancher: with only the agent, the cluster is downstream', async () => {
    const { ci } = clusterInfoWith([aksNode], ['cattle-cluster-agent'])
    await ci.setKubernetesClusterName()
    assert.equal(ci.rancherManaged, true)
    assert.equal(ci.rancherRole, ERancherRole.DOWNSTREAM)
})

test('rancher: a cattle-system holding something else is NOT a Rancher', async () => {
    const { ci } = clusterInfoWith([aksNode], ['some-other-thing'])
    await ci.setKubernetesClusterName()
    assert.equal(ci.rancherManaged, false)
    assert.equal(ci.rancherRole, ERancherRole.NONE)
})

test('rancher: no cattle-system at all leaves everything untouched', async () => {
    // Not being able to read is not the same as there being none, but it is treated as "no Rancher":
    // the worst outcome is a cluster that does not say it is managed, never one that claims to be.
    const { ci } = clusterInfoWith([aksNode])
    await ci.setKubernetesClusterName()
    assert.equal(ci.rancherManaged, false)
    assert.equal(ci.name, 'shop-prod_westeurope', 'the failed lookup did not break name detection')
})

test('🔴 plain k3s is NOT reported as Rancher-managed', async () => {
    // k3s ships k3s.cattle.io and helm.cattle.io of its own, so detecting Rancher by the 'cattle.io'
    // domain reports one on every k3s in existence. It is the agent that says it, not the domain.
    const { ci } = clusterInfoWith([node({
        name: 'k3d-kwirth-server-0', controlPlane: true,
        annotations: { 'k3s.io/hostname': 'k3d-kwirth-server-0', 'k3s.io/node-args': '["server"]' }
    })])
    await ci.setKubernetesClusterName()
    assert.equal(ci.flavour, EClusterFlavour.K3D)
    assert.equal(ci.rancherManaged, false)
})
