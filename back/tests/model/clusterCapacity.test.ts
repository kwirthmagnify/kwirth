// The cluster's capacity (vcpus, memory), worked out by the core from the nodes' status.capacity.
//
// It used to be written by the 'metrics' provider from the kubelets' machine metrics. The provider is an
// installable extension now (providers/metrics), so the core computes it itself in getNodes(), and what
// ConfigApi publishes (/config/cluster) no longer depends on the provider being installed.

import test from 'node:test'
import assert from 'node:assert/strict'
import { CoreV1Api, V1Node } from '@kubernetes/client-node'
import { ClusterInfo } from '../../src/model/ClusterInfo'

const node = (name: string, cpu: string, memory: string, unschedulable = false): V1Node => ({
    metadata: { name },
    spec: { unschedulable },
    status: {
        capacity: { cpu, memory },
        allocatable: { pods: '110' },
        addresses: [{ type: 'InternalIP', address: `10.0.0.${name.length}` }]
    }
})

const clusterInfoWith = (nodes: V1Node[]): ClusterInfo => {
    const clusterInfo = new ClusterInfo()
    clusterInfo.coreApi = { listNode: async () => ({ items: nodes }) } as unknown as CoreV1Api
    return clusterInfo
}

test('vcpus and memory are the sum of the nodes capacity, whatever the unit', async () => {
    // millicores and binary suffixes, as the kubelet reports them
    const clusterInfo = clusterInfoWith([node('n1', '4', '16Gi'), node('n2', '2000m', '8192Mi')])
    await clusterInfo.getNodes()
    assert.equal(clusterInfo.vcpus, 6)
    assert.equal(clusterInfo.memory, 24 * 1024 ** 3)
})

test('an unschedulable node still counts towards capacity, even if it is left out of the node list', async () => {
    // the capacity is the cluster's; the node map is where Kwirth reads metrics from
    const clusterInfo = clusterInfoWith([node('n1', '4', '4Gi'), node('cordoned', '4', '4Gi', true)])
    const nodes = await clusterInfo.getNodes()
    assert.deepEqual([...nodes.keys()], ['n1'])
    assert.equal(clusterInfo.vcpus, 8)
})

test('a node that declares no capacity adds nothing and breaks nothing', async () => {
    const bare: V1Node = { metadata: { name: 'bare' }, spec: {}, status: { addresses: [{ type: 'InternalIP', address: '10.0.0.9' }] } }
    const clusterInfo = clusterInfoWith([node('n1', '2', '1Gi'), bare])
    await clusterInfo.getNodes()
    assert.equal(clusterInfo.vcpus, 2)
    assert.equal(clusterInfo.memory, 1024 ** 3)
})
