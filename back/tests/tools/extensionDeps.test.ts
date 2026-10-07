import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateExtensionDeps, IInstalledIndex, normalizeRequires } from '../../src/tools/ExtensionDeps'
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

// ── The old string form has to go through normalizeRequires ──────────────────
//
// A package.json published before the unification declares "provider:service-flow:0.1.0" as a plain
// string. Handing that straight to the validator makes every extensionType come out undefined, and the
// install dies with "Unknown extension type: 'undefined'" — an error that blames the extension when the
// fault is in the manager that forgot to normalize. It happened in five of them at once.

test('el formato de CADENA se convierte en requisito de verdad', () => {
    const [requirement] = normalizeRequires(['provider:service-flow:0.1.0'])
    assert.equal(requirement.extensionType, EExtensionType.PROVIDER)
    assert.equal(requirement.id, 'service-flow')
    assert.equal(requirement.minVersion, '0.1.0')
})

test('normalizado, una dependencia en formato cadena VALIDA contra lo instalado', () => {
    const installed = empty()
    installed.provider.push({ id: 'service-flow', version: '0.1.3' })

    // Sin normalizar: el tipo sale undefined y el error culpa a la extension.
    const crudo = validateExtensionDeps(['provider:service-flow:0.1.0'] as unknown as IExtensionRequirement[], installed)
    assert.match(crudo[0], /Unknown extension type/)

    // Normalizado: pasa, que es lo que el usuario espera al instalar un plugin cuyo provider ESTA.
    assert.deepEqual(validateExtensionDeps(normalizeRequires(['provider:service-flow:0.1.0']), installed), [])
})

test('una cadena con un provider que NO esta sigue fallando, y por el motivo bueno', () => {
    const errors = validateExtensionDeps(normalizeRequires(['provider:service-flow:0.1.0']), empty())
    assert.equal(errors.length, 1)
    assert.match(errors[0], /is not installed/)
    assert.doesNotMatch(errors[0], /Unknown extension type/)
})

test('el formato de objeto pasa intacto', () => {
    const objeto = req(EExtensionType.PROVIDER, 'service-flow', '0.1.0')
    assert.deepEqual(normalizeRequires([objeto]), [objeto])
})

test('sin requisitos no se inventa ninguno', () => {
    assert.deepEqual(normalizeRequires(undefined), [])
    assert.deepEqual(normalizeRequires([]), [])
})
