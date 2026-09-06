import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateExtensionDeps, IInstalledIndex } from '../../src/tools/ExtensionDeps'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'

// Un miembro de un pack declara sus dependencias como '<tipo>:<id>:<version minima>'. El indice de
// instalados tiene que conocer TODOS los tipos instalables, o una dependencia legitima se rechaza con
// 'Unknown extension type'.

const empty = (): IInstalledIndex =>
    ({ plugin: [], provider: [], sender: [], theme: [], homepage: [], idp: [], login: [], webhook: [], docs: [] })

const withOne = (type: keyof IInstalledIndex, id: string, version: string): IInstalledIndex =>
    ({ ...empty(), [type]: [{ id, version }] })

test('el indice de instalados cubre todos los tipos que se pueden instalar', () => {
    const index = empty()
    // 'pack' es el continente, no un miembro: no se instala como dependencia de nadie
    const installable = Object.values(EExtensionType).filter(t => t !== EExtensionType.PACK)
    for (const type of installable) {
        assert.ok(type in index, `el tipo '${type}' no esta en IInstalledIndex: sus dependencias no se podrian resolver`)
    }
})

test('una dependencia de webhook se resuelve', () => {
    assert.deepEqual(validateExtensionDeps(['webhook:jira:0.1.0'], withOne('webhook', 'jira', '0.1.1')), [])
})

test('una dependencia de docs se resuelve', () => {
    assert.deepEqual(validateExtensionDeps(['docs:excubitor:0.1.0'], withOne('docs', 'excubitor', '0.1.191')), [])
})

test('la version instalada tiene que llegar al minimo pedido', () => {
    const errors = validateExtensionDeps(['webhook:jira:0.2.0'], withOne('webhook', 'jira', '0.1.9'))
    assert.equal(errors.length, 1)
    assert.match(errors[0], /version >=0\.2\.0, found 0\.1\.9/)
})

test('una dependencia que no esta instalada se reporta', () => {
    const errors = validateExtensionDeps(['webhook:teams:0.1.0'], empty())
    assert.equal(errors.length, 1)
    assert.match(errors[0], /not installed/)
})

test('un tipo inexistente se reporta como tal, no como falta de instalacion', () => {
    const errors = validateExtensionDeps(['gadget:foo:1.0.0'], empty())
    assert.equal(errors.length, 1)
    assert.match(errors[0], /Unknown extension type/)
})

test('un formato mal escrito no se confunde con una dependencia sin instalar', () => {
    const errors = validateExtensionDeps(['webhook:jira'], empty())
    assert.equal(errors.length, 1)
    assert.match(errors[0], /Invalid requirement format/)
})

test('se acumulan los errores de todas las dependencias, no solo la primera', () => {
    const errors = validateExtensionDeps(['webhook:teams:0.1.0', 'docs:nada:1.0.0'], empty())
    assert.equal(errors.length, 2)
})
