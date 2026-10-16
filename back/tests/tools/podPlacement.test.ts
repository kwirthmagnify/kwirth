import { test } from 'node:test'
import assert from 'node:assert/strict'
import { restartsByExitingProcess, servesCoreLogFromMemory } from '../../src/tools/ExecutionEnvironment'

/*
    Restart and the core log depend on whether Kwirth IS a pod, not on whether it can reach a Kubernetes
    API. The cases below are the deployments that tell the two apart: Docker or Compose with a kubeconfig
    mounted has an API but no pod of its own, and asking for the API is what left restart failing and the
    Log tab empty there.
*/

test('a pod restarts its deployment, it does not exit', () => {
    assert.equal(restartsByExitingProcess(true, false), false)
})

// The kubeconfig is not a parameter on purpose: with or without one, a container that is not a pod exits.
test('Docker, Compose, ECS, ACI or Cloud Run restart by exiting, with or without a kubeconfig', () => {
    assert.equal(restartsByExitingProcess(false, false), true)
})

test('desktop never exits on restart: nothing outside the app would bring it back', () => {
    assert.equal(restartsByExitingProcess(false, true), false)
})

test('a pod reads its log from the kubelet, not from memory', () => {
    assert.equal(servesCoreLogFromMemory(true), false)
})

test('outside a pod the core log comes from memory, with or without a kubeconfig', () => {
    assert.equal(servesCoreLogFromMemory(false), true)
})
