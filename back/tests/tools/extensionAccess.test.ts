import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { buildExtensionAccess, IInstalledMeta } from '../../src/tools/ExtensionAccess'

/*
    ClusterInfo.extensions: the installed extensions of any type, with version and source (Status).
    What is pinned: only the three fields travel, a type whose manager does not exist is "unknown" (it
    throws) and never an empty list, and the managers are read when asked, not when built.
*/

const meta = (id: string, over: Partial<IInstalledMeta> & Record<string, unknown> = {}) => ({ id, version: '1.0.0', ...over })

test('🔴 only id, version and source travel — not the rest of a manager\'s metadata', async () => {
    const access = buildExtensionAccess(() => ({
        [EExtensionType.PROVIDER]: async () => [meta('aws', { version: '0.3.1', installedFrom: 'dev', configSchema: [1], backStored: true })]
    }))
    assert.deepEqual(await access.listInstalled(EExtensionType.PROVIDER), [{ id: 'aws', version: '0.3.1', installedFrom: 'dev' }])
})

test('no source is no field, not an empty one', async () => {
    const access = buildExtensionAccess(() => ({ [EExtensionType.SENDER]: async () => [meta('file')] }))
    const [s] = await access.listInstalled(EExtensionType.SENDER)
    assert.equal('installedFrom' in s, false)
})

test('🔴 a type with no manager (yet) throws: unknown, never "nothing installed"', async () => {
    const access = buildExtensionAccess(() => ({ [EExtensionType.PROVIDER]: undefined }))
    await assert.rejects(access.listInstalled(EExtensionType.WEBHOOK), /no manager for 'webhook'/)
    await assert.rejects(access.listInstalled(EExtensionType.PROVIDER), /no manager for 'provider'/)
})

test('the managers are read when asked: one that appears later is found', async () => {
    let ready = false
    const access = buildExtensionAccess(() => ({ [EExtensionType.THEME]: ready ? async () => [meta('matrix')] : undefined }))
    await assert.rejects(access.listInstalled(EExtensionType.THEME))
    ready = true
    assert.deepEqual((await access.listInstalled(EExtensionType.THEME)).map(e => e.id), ['matrix'])
})

test('an empty manager is an empty list', async () => {
    const access = buildExtensionAccess(() => ({ [EExtensionType.DOCS]: async () => [] }))
    assert.deepEqual(await access.listInstalled(EExtensionType.DOCS), [])
})
