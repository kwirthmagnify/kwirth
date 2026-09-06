import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MarketplaceManager, IMarketplaceSource } from '../../src/tools/MarketplaceManager'
import { EExtensionType, EManifestAuthType, IKwirthSettings, IMarketplace, IMarketplaceEntry } from '@kwirthmagnify/kwirth-common'

const entry = (id: string, version: string, extensionType = EExtensionType.PLUGIN): IMarketplaceEntry => ({
    extensionType, id, version, name: id, url: `https://example.com/${id}-${version}.tgz`
})

const source = (marketplaceId: string|undefined, entries: IMarketplaceEntry[]): IMarketplaceSource =>
    marketplaceId === undefined ? { entries } : { marketplaceId, marketplaceLabel: marketplaceId.toUpperCase(), entries }

const versionsOf = (list: IMarketplaceEntry[], id: string) => list.filter(e => e.id === id).map(e => e.version).sort()

// ---- filtrado por tipo ----

test('solo devuelve entradas del tipo pedido', () => {
    const s = source(undefined, [entry('log', '1.0.0'), entry('jira', '1.0.0', EExtensionType.SENDER)])
    const out = MarketplaceManager.resolveEntries([s], EExtensionType.PLUGIN)
    assert.deepEqual(out.map(e => e.id), ['log'])
})

test('mismo id en tipos distintos NO se eclipsan: son extensiones distintas', () => {
    // un marketplace privado publica un SENDER llamado 'log'; no debe tapar al PLUGIN 'log' publico
    const priv = source('nexus', [entry('log', '9.9.9', EExtensionType.SENDER)])
    const pub = source(undefined, [entry('log', '1.0.0', EExtensionType.PLUGIN)])
    const plugins = MarketplaceManager.resolveEntries([priv, pub], EExtensionType.PLUGIN)
    assert.deepEqual(plugins.map(e => e.version), ['1.0.0'])
    assert.equal(plugins[0].marketplaceId, undefined, 'el plugin sigue viniendo del publico')
    const senders = MarketplaceManager.resolveEntries([priv, pub], EExtensionType.SENDER)
    assert.deepEqual(senders.map(e => e.version), ['9.9.9'])
})

// ---- docs: la identidad es el par (targetType, id) ----
//
// El id de una documentacion es el de la extension que documenta, asi que se repite entre tipos: la guia
// del plugin 'metrics' y la del theme 'metrics' comparten id y son extensiones distintas.

const docsEntry = (targetType: string, id: string, version: string): IMarketplaceEntry => ({
    extensionType: EExtensionType.DOCS, targetType, id, version, name: `${id} guide`,
    url: `https://example.com/docs-${targetType}-${id}-${version}.tgz`
})

test('dos guias con el mismo id y distinto targetType no se eclipsan', () => {
    const s = source('nexus', [docsEntry('plugin', 'metrics', '1.0.0'), docsEntry('theme', 'metrics', '2.0.0')])
    const out = MarketplaceManager.resolveEntries([s], EExtensionType.DOCS)
    assert.equal(out.length, 2, 'son dos documentaciones distintas, no dos versiones de una')
    assert.deepEqual(out.filter(e => e.targetType === 'plugin').map(e => e.version), ['1.0.0'])
    assert.deepEqual(out.filter(e => e.targetType === 'theme').map(e => e.version), ['2.0.0'])
})

test('la precedencia entre marketplaces tambien va por el par, no por el id', () => {
    // el privado publica la guia del PLUGIN 'metrics'; no debe tapar la del THEME 'metrics' del publico
    const priv = source('nexus', [docsEntry('plugin', 'metrics', '9.9.9')])
    const pub = source(undefined, [docsEntry('plugin', 'metrics', '1.0.0'), docsEntry('theme', 'metrics', '1.0.0')])
    const out = MarketplaceManager.resolveEntries([priv, pub], EExtensionType.DOCS)

    const forPlugin = out.filter(e => e.targetType === 'plugin')
    assert.deepEqual(forPlugin.map(e => e.version), ['9.9.9'], 'la del plugin la sirve el privado, entera')
    assert.equal(forPlugin[0].marketplaceId, 'nexus')

    const forTheme = out.filter(e => e.targetType === 'theme')
    assert.deepEqual(forTheme.map(e => e.version), ['1.0.0'], 'la del theme sigue viniendo del publico')
    assert.equal(forTheme[0].marketplaceId, undefined)
})

test('el ganador de un par aporta todo su historico de versiones', () => {
    const priv = source('nexus', [docsEntry('plugin', 'excubitor', '0.1.190'), docsEntry('plugin', 'excubitor', '0.1.191')])
    const pub = source(undefined, [docsEntry('plugin', 'excubitor', '0.0.1')])
    const out = MarketplaceManager.resolveEntries([priv, pub], EExtensionType.DOCS)
    assert.deepEqual(out.map(e => e.version).sort(), ['0.1.190', '0.1.191'])
    assert.ok(out.every(e => e.marketplaceId === 'nexus'), 'ninguna version se mezcla con la del publico')
})

test('una entrada sin targetType sigue identificandose solo por id', () => {
    // el resto de tipos no llevan targetType: su comportamiento no cambia
    const priv = source('nexus', [entry('log', '9.9.9')])
    const pub = source(undefined, [entry('log', '1.0.0')])
    const out = MarketplaceManager.resolveEntries([priv, pub], EExtensionType.PLUGIN)
    assert.deepEqual(out.map(e => e.version), ['9.9.9'])
})

test('un manifest con varios tipos sirve a cada manager por separado', () => {
    const mixed = source('nexus', [
        entry('a', '1.0.0', EExtensionType.PLUGIN),
        entry('b', '1.0.0', EExtensionType.SENDER),
        entry('c', '1.0.0', EExtensionType.THEME)
    ])
    assert.deepEqual(MarketplaceManager.resolveEntries([mixed], EExtensionType.PLUGIN).map(e => e.id), ['a'])
    assert.deepEqual(MarketplaceManager.resolveEntries([mixed], EExtensionType.SENDER).map(e => e.id), ['b'])
    assert.deepEqual(MarketplaceManager.resolveEntries([mixed], EExtensionType.THEME).map(e => e.id), ['c'])
})

// ---- precedencia ----

test('id solo en el publico: sale del publico, sin marketplaceId', () => {
    const out = MarketplaceManager.resolveEntries([source('nexus', []), source(undefined, [entry('log', '1.0.0')])], EExtensionType.PLUGIN)
    assert.equal(out.length, 1)
    assert.equal(out[0].marketplaceId, undefined)
})

test('id solo en un privado: sale del privado, con procedencia estampada', () => {
    const out = MarketplaceManager.resolveEntries([source('nexus', [entry('mio', '1.0.0')]), source(undefined, [])], EExtensionType.PLUGIN)
    assert.equal(out.length, 1)
    assert.equal(out[0].marketplaceId, 'nexus')
    assert.equal(out[0].marketplaceLabel, 'NEXUS')
})

test('id en ambos: gana el privado y el publico desaparece por completo', () => {
    const priv = source('nexus', [entry('log', '9.0.0')])
    const pub = source(undefined, [entry('log', '1.0.0'), entry('log', '1.0.1')])
    const out = MarketplaceManager.resolveEntries([priv, pub], EExtensionType.PLUGIN)
    assert.deepEqual(out.map(e => e.version), ['9.0.0'])
    assert.equal(out.every(e => e.marketplaceId === 'nexus'), true)
})

test('LAS VERSIONES NUNCA SE MEZCLAN entre marketplaces', () => {
    // el caso que motiva la regla: un log 1.0.0 privado y un log 0.2.20 publico no pueden
    // acabar en la misma lista de versiones, o el selector ofreceria tarballs de otro origen
    const priv = source('nexus', [entry('log', '1.0.0')])
    const pub = source(undefined, [entry('log', '0.2.20'), entry('log', '0.2.19'), entry('log', '0.2.18')])
    const out = MarketplaceManager.resolveEntries([priv, pub], EExtensionType.PLUGIN)
    assert.deepEqual(versionsOf(out, 'log'), ['1.0.0'])
})

test('el ganador aporta TODO su historico de versiones, no solo la mayor', () => {
    const priv = source('nexus', [entry('log', '2.0.0'), entry('log', '1.5.0'), entry('log', '1.0.0')])
    const pub = source(undefined, [entry('log', '0.2.20')])
    const out = MarketplaceManager.resolveEntries([priv, pub], EExtensionType.PLUGIN)
    assert.deepEqual(versionsOf(out, 'log'), ['1.0.0', '1.5.0', '2.0.0'])
})

test('entre varios privados manda el orden configurado', () => {
    const first = source('uno', [entry('log', '1.0.0')])
    const second = source('dos', [entry('log', '2.0.0')])
    const out = MarketplaceManager.resolveEntries([first, second, source(undefined, [entry('log', '0.1.0')])], EExtensionType.PLUGIN)
    assert.deepEqual(out.map(e => e.version), ['1.0.0'])
    assert.equal(out[0].marketplaceId, 'uno')
})

test('la precedencia es por id, no por marketplace entero', () => {
    // 'a' lo gana el privado; 'b', que el privado no tiene, sigue viniendo del publico
    const priv = source('nexus', [entry('a', '9.0.0')])
    const pub = source(undefined, [entry('a', '1.0.0'), entry('b', '1.0.0')])
    const out = MarketplaceManager.resolveEntries([priv, pub], EExtensionType.PLUGIN)
    assert.equal(out.find(e => e.id === 'a')?.marketplaceId, 'nexus')
    assert.equal(out.find(e => e.id === 'b')?.marketplaceId, undefined)
})

test('una fuente vacia o caida no altera el resultado', () => {
    const out = MarketplaceManager.resolveEntries([source('caido', []), source(undefined, [entry('log', '1.0.0')])], EExtensionType.PLUGIN)
    assert.deepEqual(out.map(e => e.version), ['1.0.0'])
})

test('sin fuentes devuelve lista vacia', () => {
    assert.deepEqual(MarketplaceManager.resolveEntries([], EExtensionType.PLUGIN), [])
})

// ---- construccion de la lista de fuentes ----

const mp = (id: string, enabled: boolean) => ({ id, url: `https://example.com/${id}.json`, label: id, enabled })

test('buildSourceList pone los privados habilitados primero y el publico al final', () => {
    const settings: IKwirthSettings = { marketplaces: [mp('uno', true), mp('dos', true)] }
    const list = MarketplaceManager.buildSourceList(settings, EExtensionType.PLUGIN)
    assert.deepEqual(list.map(i => i.marketplace?.id), ['uno', 'dos', undefined])
    assert.match(list[2].url, /plugins\/manifest\.json$/)
})

test('buildSourceList ignora los deshabilitados', () => {
    const settings: IKwirthSettings = { marketplaces: [mp('uno', false), mp('dos', true)] }
    const list = MarketplaceManager.buildSourceList(settings, EExtensionType.PLUGIN)
    assert.deepEqual(list.map(i => i.marketplace?.id), ['dos', undefined])
})

test('buildSourceList sin marketplaces deja solo el publico', () => {
    const list = MarketplaceManager.buildSourceList({}, EExtensionType.SENDER)
    assert.equal(list.length, 1)
    assert.match(list[0].url, /senders\/manifest\.json$/)
})

test('buildSourceList apunta a la carpeta correcta de cada tipo', () => {
    const folders: [EExtensionType, string][] = [
        [EExtensionType.PLUGIN, 'plugins'], [EExtensionType.SENDER, 'senders'], [EExtensionType.PROVIDER, 'providers'],
        [EExtensionType.THEME, 'themes'], [EExtensionType.HOMEPAGE, 'homepages'], [EExtensionType.WEBHOOK, 'webhooks'],
        [EExtensionType.LOGIN, 'logins'], [EExtensionType.PACK, 'packs'], [EExtensionType.DOCS, 'docs'],
        [EExtensionType.IDP, 'idps']
    ]
    for (const [type, folder] of folders) {
        const list = MarketplaceManager.buildSourceList({}, type)
        assert.match(list[0].url, new RegExp(`/${folder}/manifest\\.json$`), `${type} debe apuntar a ${folder}`)
    }
})
