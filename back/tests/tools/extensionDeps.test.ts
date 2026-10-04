import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateExtensionDeps, IInstalledIndex } from '../../src/tools/ExtensionDeps'
import { EExtensionType, IExtensionRequirement } from '@kwirthmagnify/kwirth-common'

// A pack member declares its dependencies as IExtensionRequirement objects: { extensionType, id, minVersion }.
// The installed index has to know EVERY installable type, or a legitimate dependency is rejected with
// 'Unknown extension type'.

const empty = (): IInstalledIndex =>
    ({ plugin: [], provider: [], sender: [], theme: [], homepage: [], idp: [], login: [], webhook: [], docs: [], aitoolset: [], dce: [] })

const withOne = (type: keyof IInstalledIndex, id: string, version: string): IInstalledIndex =>
    ({ ...empty(), [type]: [{ id, version }] })

const req = (extensionType: EExtensionType, id: string, minVersion: string): IExtensionRequirement =>
    ({ extensionType, id, minVersion })

test('el indice de instalados cubre todos los tipos que se pueden instalar', () => {
    const index = empty()
    // 'pack' is the container, not a member: it is installed as nobody's dependency
    const installable = Object.values(EExtensionType).filter(t => t !== EExtensionType.PACK)
    for (const type of installable) {
        assert.ok(type in index, `el tipo '${type}' no esta en IInstalledIndex: sus dependencias no se podrian resolver`)
    }
})

test('una dependencia de webhook se resuelve', () => {
    assert.deepEqual(validateExtensionDeps([req(EExtensionType.WEBHOOK, 'jira', '0.1.0')], withOne('webhook', 'jira', '0.1.1')), [])
})

test('una dependencia de docs se resuelve', () => {
    assert.deepEqual(validateExtensionDeps([req(EExtensionType.DOCS, 'excubitor', '0.1.0')], withOne('docs', 'excubitor', '0.1.191')), [])
})

test('la version instalada tiene que llegar al minimo pedido', () => {
    const errors = validateExtensionDeps([req(EExtensionType.WEBHOOK, 'jira', '0.2.0')], withOne('webhook', 'jira', '0.1.9'))
    assert.equal(errors.length, 1)
    assert.match(errors[0], /version >=0\.2\.0, found 0\.1\.9/)
})

test('una dependencia que no esta instalada se reporta', () => {
    const errors = validateExtensionDeps([req(EExtensionType.WEBHOOK, 'teams', '0.1.0')], empty())
    assert.equal(errors.length, 1)
    assert.match(errors[0], /not installed/)
})

test('un tipo inexistente se reporta como tal, no como falta de instalacion', () => {
    const errors = validateExtensionDeps([req('gadget' as EExtensionType, 'foo', '1.0.0')], empty())
    assert.equal(errors.length, 1)
    assert.match(errors[0], /Unknown extension type/)
})

test('se acumulan los errores de todas las dependencias, no solo la primera', () => {
    const errors = validateExtensionDeps([req(EExtensionType.WEBHOOK, 'teams', '0.1.0'), req(EExtensionType.DOCS, 'nada', '1.0.0')], empty())
    assert.equal(errors.length, 2)
})
