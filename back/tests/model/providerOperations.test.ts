// The OPERATIONS of the provider contract (IProvider.getOperations / runOperation), through the handle
// ClusterInfo hands out (plan iria/plans/aws-serverless-toolsets, D8). An operation changes the world, so it goes
// through the handle — never a method looked up on the provider — and the core logs who ran it.

import test from 'node:test'
import assert from 'node:assert/strict'
import { ClusterInfo } from '../../src/model/ClusterInfo'
import { IChannel } from '../../src/channels/IChannel'
import { IProvider } from '../../src/providers/IProvider'

const consumer = { getChannelData: () => ({ id: 'agora' }) } as unknown as IChannel

const clusterInfoWith = (providers: object[]): ClusterInfo => {
    const clusterInfo = new ClusterInfo()
    clusterInfo.providers = providers.map(p => ({ addSubscriber: async () => { }, removeSubscriber: async () => { }, ...p }) as unknown as IProvider)
    return clusterInfo
}

const SCALE = { name: 'ecs-scale', description: 'Changes the desired tasks', args: { usage: 'service and count', example: { object: 'ecs/1/eu-west-1/c/s', count: 2 } } }

test('getOperations: what the provider offers; none when it does not operate, or when listing them fails', () => {
    assert.deepEqual(clusterInfoWith([{ id: 'aws', getOperations: () => [SCALE] }]).getProvider('aws', consumer)!.getOperations(), [SCALE])
    assert.deepEqual(clusterInfoWith([{ id: 'tick' }]).getProvider('tick', consumer)!.getOperations(), [])
    assert.deepEqual(clusterInfoWith([{ id: 'bad', getOperations: () => { throw new Error('boom') } }]).getProvider('bad', consumer)!.getOperations(), [], 'a provider that fails listing them offers none')
})

test('runOperation: hands name, arguments and the dry-run flag to the provider and returns its result as it is', async () => {
    const seen: unknown[] = []
    const handle = clusterInfoWith([{
        id: 'aws',
        runOperation: async (name: string, args: Record<string, unknown>, options: { dryRun: boolean }) => {
            seen.push({ name, args, options })
            return { success: true, dryRun: options.dryRun, message: `would scale to ${args.count}`, preview: { before: 4, after: 2 } }
        }
    }]).getProvider('aws', consumer)!
    const r = await handle.runOperation('ecs-scale', { count: 2 }, { dryRun: true })
    assert.deepEqual(r, { success: true, dryRun: true, message: 'would scale to 2', preview: { before: 4, after: 2 } })
    assert.deepEqual(seen, [{ name: 'ecs-scale', args: { count: 2 }, options: { dryRun: true } }])
})

test('runOperation: dryRun is a strict boolean on the way to the provider (anything but true is a real run)', async () => {
    const flags: boolean[] = []
    const handle = clusterInfoWith([{ id: 'aws', runOperation: async (_n: string, _a: unknown, o: { dryRun: boolean }) => { flags.push(o.dryRun); return { success: true, dryRun: o.dryRun } } }]).getProvider('aws', consumer)!
    await handle.runOperation('x', {}, { dryRun: true })
    await handle.runOperation('x', {}, { dryRun: false })
    await handle.runOperation('x', {}, { dryRun: 'yes' as unknown as boolean })
    assert.deepEqual(flags, [true, false, false])
})

test('runOperation: a provider without operations is refused with a clear error; a failure inside reaches the caller', async () => {
    await assert.rejects(clusterInfoWith([{ id: 'tick' }]).getProvider('tick', consumer)!.runOperation('x', {}, { dryRun: true }), /Provider 'tick' has no operations/)
    const failing = clusterInfoWith([{ id: 'aws', runOperation: async () => { throw new Error('AccessDenied: ecs:UpdateService') } }]).getProvider('aws', consumer)!
    await assert.rejects(failing.runOperation('ecs-scale', {}, { dryRun: false }), /AccessDenied: ecs:UpdateService/)
})

test('operating does not subscribe: the registry of subscriptions stays as it was', async () => {
    const clusterInfo = clusterInfoWith([{ id: 'aws', runOperation: async () => ({ success: true, dryRun: true }) }])
    await clusterInfo.getProvider('aws', consumer)!.runOperation('x', {}, { dryRun: true })
    assert.deepEqual(clusterInfo.getSubscriptions(), [])
})
