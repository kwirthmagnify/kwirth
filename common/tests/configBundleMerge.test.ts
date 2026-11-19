import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IConfigBundle, IConfigBundleEntry, CONFIG_BUNDLE_KIND, CONFIG_BUNDLE_FORMAT_VERSION, validateBundle, normalizeEntry } from '../src/ConfigBundle'
import { EConfigMergeItemKind, IConfigMergeSource, analyzeMerge, buildMerged } from '../src/ConfigBundleMerge'
import { EExtensionType } from '../src/ExtensionType'

/*
    Merging configuration bundles (plans/config-merge): one source, identical, differs — for every kind of
    element — and what the merged file declares.
*/

const NOW = '2026-11-19T10:00:00.000Z'

const bundle = (core: IConfigBundle['core'], extensions: IConfigBundleEntry[] = [], includesCredentials = false, formatVersion = CONFIG_BUNDLE_FORMAT_VERSION): IConfigBundle => ({
    kind: CONFIG_BUNDLE_KIND,
    formatVersion,
    meta: { exportedAt: '2026-11-01T00:00:00.000Z', kwirthVersion: '0.6.100', includesCredentials },
    core,
    extensions
})

const src = (name: string, b: IConfigBundle): IConfigMergeSource => ({ name, bundle: b })

const mkt = (id: string, url: string) => ({ id, url, label: id, enabled: true })

// ── one source ──────────────────────────────────────────────────────────────────────────────────────

test('a single source goes in whole, with nothing to ask', () => {
    const a = bundle(
        { settings: { metricsInterval: 15, marketplaces: [mkt('acme', 'https://a')], log: { levels: { core: 'info' }, ansi: false } },
          sharedAi: { providers: [{ name: 'openai', key: 'k' }], llms: [{ id: 'gpt', provider: 'openai' }] } },
        [{ type: EExtensionType.PLUGIN, id: 'agora', version: '1.0.0', coreConfig: { x: 1 }, config: { y: 2 } }]
    )
    const analysis = analyzeMerge([src('a.json', a)])
    assert.deepEqual(analysis.differences, [])
    assert.deepEqual(analysis.warnings, [])
    assert.deepEqual(analysis.merged, {
        [EConfigMergeItemKind.SETTING]: 2,
        [EConfigMergeItemKind.MARKETPLACE]: 1,
        [EConfigMergeItemKind.LOG_LEVEL]: 1,
        [EConfigMergeItemKind.AI_PROVIDER]: 1,
        [EConfigMergeItemKind.AI_MODEL]: 1,
        [EConfigMergeItemKind.EXTENSION]: 1
    })
    const out = buildMerged([src('a.json', a)], {}, '0.6.120', NOW)
    assert.deepEqual(out.core, a.core)
    assert.deepEqual(out.extensions, a.extensions)
    assert.equal(out.formatVersion, CONFIG_BUNDLE_FORMAT_VERSION)
    assert.equal(out.meta.exportedAt, NOW)
    assert.equal(out.meta.kwirthVersion, '0.6.120')
    assert.equal(out.meta.source, 'merge of: a.json')
    assert.equal(validateBundle(out), undefined)
})

// ── identical ───────────────────────────────────────────────────────────────────────────────────────

test('identical elements go in once, regardless of key order', () => {
    const a = bundle({ settings: { marketplaces: [{ id: 'acme', url: 'https://a', label: 'acme', enabled: true }] } })
    const b = bundle({ settings: { marketplaces: [{ enabled: true, label: 'acme', url: 'https://a', id: 'acme' }] } })
    const analysis = analyzeMerge([src('a', a), src('b', b)])
    assert.deepEqual(analysis.differences, [])
    assert.equal(analysis.merged[EConfigMergeItemKind.MARKETPLACE], 1)
    const out = buildMerged([src('a', a), src('b', b)], {}, 'v', NOW)
    assert.deepEqual(out.core.settings, { marketplaces: [mkt('acme', 'https://a')] })
})

test('elements in one source each are united', () => {
    const a = bundle({ settings: { marketplaces: [mkt('acme', 'https://a')] } })
    const b = bundle({ settings: { marketplaces: [mkt('beta', 'https://b')] } })
    const out = buildMerged([src('a', a), src('b', b)], {}, 'v', NOW)
    assert.deepEqual(out.core.settings, { marketplaces: [mkt('acme', 'https://a'), mkt('beta', 'https://b')] })
})

// ── differs, for every kind ─────────────────────────────────────────────────────────────────────────

test('every kind of element: same identifier, different content, is a difference', () => {
    const a = bundle({
        settings: {
            metricsInterval: 15,
            marketplaces: [mkt('acme', 'https://a')],
            packageRegistries: [{ id: 'nexus', url: 'https://n1', label: 'n', enabled: true }],
            trustedProxies: [{ address: '10.0.0.1', comment: 'lb' }],
            loginIpFilter: { enabled: true, allowed: [{ address: '1.2.3.4', comment: 'office' }] },
            log: { levels: { core: 'info' } }
        },
        sharedAi: { providers: [{ name: 'openai', key: 'k1' }], llms: [{ id: 'gpt', provider: 'openai', model: 'a' }] }
    }, [{ type: EExtensionType.PLUGIN, id: 'agora', version: '1.0.0', config: { rooms: 1 } }])
    const b = bundle({
        settings: {
            metricsInterval: 30,
            marketplaces: [mkt('acme', 'https://other')],
            packageRegistries: [{ id: 'nexus', url: 'https://n2', label: 'n', enabled: true }],
            trustedProxies: [{ address: '10.0.0.1', comment: 'ingress' }],
            loginIpFilter: { enabled: false, allowed: [{ address: '1.2.3.4', comment: 'home' }] },
            log: { levels: { core: 'debug' } }
        },
        sharedAi: { providers: [{ name: 'openai', key: 'k2' }], llms: [{ id: 'gpt', provider: 'openai', model: 'b' }] }
    }, [{ type: EExtensionType.PLUGIN, id: 'agora', version: '1.1.0', config: { rooms: 2 } }])

    const analysis = analyzeMerge([src('a', a), src('b', b)])
    const byKey = Object.fromEntries(analysis.differences.map(d => [d.key, d]))
    const expected: [string, EConfigMergeItemKind, string][] = [
        ['settings.metricsInterval', EConfigMergeItemKind.SETTING, 'metricsInterval'],
        ['settings.marketplaces[acme]', EConfigMergeItemKind.MARKETPLACE, 'acme'],
        ['settings.packageRegistries[nexus]', EConfigMergeItemKind.PACKAGE_REGISTRY, 'nexus'],
        ['settings.trustedProxies[10.0.0.1]', EConfigMergeItemKind.TRUSTED_PROXY, '10.0.0.1'],
        ['settings.loginIpFilter.enabled', EConfigMergeItemKind.SETTING, 'loginIpFilter.enabled'],
        ['settings.loginIpFilter.allowed[1.2.3.4]', EConfigMergeItemKind.LOGIN_IP_ALLOWED, '1.2.3.4'],
        ['settings.log.levels{core}', EConfigMergeItemKind.LOG_LEVEL, 'core'],
        ['sharedAi.providers[openai]', EConfigMergeItemKind.AI_PROVIDER, 'openai'],
        ['sharedAi.llms[gpt]', EConfigMergeItemKind.AI_MODEL, 'gpt'],
        ['extensions[plugin/agora]', EConfigMergeItemKind.EXTENSION, 'plugin/agora']
    ]
    assert.equal(analysis.differences.length, expected.length)
    for (const [key, kind, label] of expected) {
        assert.ok(byKey[key], `missing difference ${key}`)
        assert.equal(byKey[key].kind, kind)
        assert.equal(byKey[key].label, label)
        assert.deepEqual(byKey[key].values.map(v => v.sourceIndex), [0, 1])
    }
    assert.deepEqual(analysis.merged, {})
    assert.equal((byKey['settings.metricsInterval'].values[1].value), 30)
    assert.equal((byKey['extensions[plugin/agora]'].values[1].value as IConfigBundleEntry).version, '1.1.0')

    // Choose b for half of them, a for the rest
    const choices: Record<string, number> = {}
    analysis.differences.forEach((d, i) => { choices[d.key] = i % 2 })
    const out = buildMerged([src('a', a), src('b', b)], choices, 'v', NOW)
    assert.deepEqual(out.core.settings, {
        metricsInterval: 15,
        marketplaces: [mkt('acme', 'https://other')],
        packageRegistries: [{ id: 'nexus', url: 'https://n1', label: 'n', enabled: true }],
        trustedProxies: [{ address: '10.0.0.1', comment: 'ingress' }],
        loginIpFilter: { enabled: true, allowed: [{ address: '1.2.3.4', comment: 'home' }] },
        log: { levels: { core: 'info' } }
    })
    assert.deepEqual(out.core.sharedAi, { providers: [{ name: 'openai', key: 'k2' }], llms: [{ id: 'gpt', provider: 'openai', model: 'a' }] })
    assert.deepEqual(out.extensions, [{ type: EExtensionType.PLUGIN, id: 'agora', version: '1.1.0', config: { rooms: 2 } }])
})

test('a three-source difference lists only the sources that carry it', () => {
    const a = bundle({ settings: { metricsInterval: 15 } })
    const b = bundle({ settings: {} })
    const c = bundle({ settings: { metricsInterval: 60 } })
    const analysis = analyzeMerge([src('a', a), src('b', b), src('c', c)])
    assert.equal(analysis.differences.length, 1)
    assert.deepEqual(analysis.differences[0].values, [{ sourceIndex: 0, value: 15 }, { sourceIndex: 2, value: 60 }])
})

// ── choices ─────────────────────────────────────────────────────────────────────────────────────────

test('a missing choice, or one pointing at a source without the element, is refused', () => {
    const a = bundle({ settings: { metricsInterval: 15 } })
    const b = bundle({ settings: { metricsInterval: 30 } })
    const c = bundle({ settings: {} })
    const sources = [src('a', a), src('b', b), src('c', c)]
    assert.throws(() => buildMerged(sources, {}, 'v', NOW), /no source chosen for 'settings.metricsInterval'/)
    assert.throws(() => buildMerged(sources, { 'settings.metricsInterval': 2 }, 'v', NOW), /source 2 does not carry/)
    assert.deepEqual(buildMerged(sources, { 'settings.metricsInterval': 1 }, 'v', NOW).core.settings, { metricsInterval: 30 })
})

// ── formats ─────────────────────────────────────────────────────────────────────────────────────────

test('format 1 entries are read through normalizeEntry and compare equal to the same format 2 entry', () => {
    const v1 = bundle({}, [{ type: EExtensionType.SENDER, id: 'slack', config: { core: { channels: ['a'] }, own: { token: 'x' } } }], false, 1)
    const v2 = bundle({}, [{ type: EExtensionType.SENDER, id: 'slack', coreConfig: { channels: ['a'] }, config: { token: 'x' } }])
    const analysis = analyzeMerge([src('old', v1), src('new', v2)])
    assert.deepEqual(analysis.differences, [])
    const out = buildMerged([src('old', v1), src('new', v2)], {}, 'v', NOW)
    assert.equal(out.formatVersion, 2)
    assert.deepEqual(out.extensions[0].coreConfig, { channels: ['a'] })
    assert.deepEqual(out.extensions[0].config, { token: 'x' })
})

test('a bare format 1 entry is the core part, never the extension one', () => {
    const v1 = bundle({}, [{ type: EExtensionType.SENDER, id: 'slack', config: { channels: ['a'] } }], false, 1)
    const out = buildMerged([src('old', v1)], {}, 'v', NOW)
    assert.deepEqual(out.extensions[0].coreConfig, { channels: ['a'] })
    assert.equal(out.extensions[0].config, undefined)
    assert.deepEqual(normalizeEntry({ type: EExtensionType.SENDER, id: 's', config: { a: 1 } }, 1), { coreConfig: { a: 1 }, config: undefined })
})

test('old string address lists are read too, and keep their shape', () => {
    const a = bundle({ settings: { loginIpFilter: { enabled: true, allowed: ['1.2.3.4'], trustedProxies: ['10.0.0.1'] } } })
    const b = bundle({ settings: { loginIpFilter: { enabled: true, allowed: [{ address: '5.6.7.8', comment: '' }] } } })
    const analysis = analyzeMerge([src('a', a), src('b', b)])
    assert.deepEqual(analysis.differences, [])
    const out = buildMerged([src('a', a), src('b', b)], {}, 'v', NOW)
    assert.deepEqual(out.core.settings, { loginIpFilter: { enabled: true, allowed: ['1.2.3.4', { address: '5.6.7.8', comment: '' }], trustedProxies: ['10.0.0.1'] } })
})

// ── containers, unknown fields, odd elements ────────────────────────────────────────────────────────

test('an empty list in the sources stays an empty list; unknown fields travel as loose values', () => {
    const a = bundle({ settings: { marketplaces: [], somethingNew: { deep: [1, 2] } } })
    const out = buildMerged([src('a', a)], {}, 'v', NOW)
    assert.deepEqual(out.core.settings, { marketplaces: [], somethingNew: { deep: [1, 2] } })
    assert.equal(out.core.sharedAi, undefined)
})

test('elements without an id merge by content; a repeated id in one source is kept twice', () => {
    const a = bundle({ settings: { marketplaces: [{ url: 'https://x' }, mkt('dup', 'https://1'), mkt('dup', 'https://2')] } })
    const b = bundle({ settings: { marketplaces: [{ url: 'https://x' }] } })
    const analysis = analyzeMerge([src('a', a), src('b', b)])
    assert.deepEqual(analysis.differences, [])
    const out = buildMerged([src('a', a), src('b', b)], {}, 'v', NOW)
    assert.deepEqual(out.core.settings, { marketplaces: [{ url: 'https://x' }, mkt('dup', 'https://1'), mkt('dup', 'https://2')] })
})

// ── credentials ─────────────────────────────────────────────────────────────────────────────────────

test('includesCredentials is true only if a source that contributes carries them', () => {
    const withCreds = bundle({ settings: { metricsInterval: 15 } }, [], true)
    const without = bundle({ settings: { metricsInterval: 30 } }, [], false)
    const sources = [src('with', withCreds), src('without', without)]
    assert.equal(buildMerged(sources, { 'settings.metricsInterval': 1 }, 'v', NOW).meta.includesCredentials, false)
    assert.equal(buildMerged(sources, { 'settings.metricsInterval': 0 }, 'v', NOW).meta.includesCredentials, true)
    // Identical in both: both contribute
    const same = [src('with', bundle({ settings: { metricsInterval: 15 } }, [], true)), src('without', bundle({ settings: { metricsInterval: 15 } }))]
    assert.equal(buildMerged(same, {}, 'v', NOW).meta.includesCredentials, true)
})

// ── credential-free exports ─────────────────────────────────────────────────────────────────────────

test('🔴 a secret blanked by a credential-free export is not a difference, and the filled one is kept', () => {
    const withCreds = bundle({
        settings: {
            marketplaces: [{ ...mkt('acme', 'https://a'), manifestAuth: { type: 'private-token', token: 'glpat-1' } }],
            packageRegistries: [{ id: 'nexus', url: 'https://n', label: 'n', enabled: true, auth: { type: 'bearer', token: 'tok' } }]
        },
        sharedAi: { providers: [{ name: 'openai', key: 'sk-1' }], llms: [{ id: 'gpt', provider: 'openai', key: 'sk-2' }] }
    }, [{ type: EExtensionType.SENDER, id: 'slack', coreConfig: { configs: [{ name: 'c', webhook: 'https://hook' }] } }], true)
    // what the export writes without credentials: tokens/passwords absent in settings, '' elsewhere
    const without = bundle({
        settings: {
            marketplaces: [{ ...mkt('acme', 'https://a'), manifestAuth: { type: 'private-token' } }],
            packageRegistries: [{ id: 'nexus', url: 'https://n', label: 'n', enabled: true, auth: { type: 'bearer' } }]
        },
        sharedAi: { providers: [{ name: 'openai', key: '' }], llms: [{ id: 'gpt', provider: 'openai', key: '' }] }
    }, [{ type: EExtensionType.SENDER, id: 'slack', coreConfig: { configs: [{ name: 'c', webhook: '' }] } }], false)

    for (const sources of [[src('file', withCreds), src('This Kwirth', without)], [src('This Kwirth', without), src('file', withCreds)]]) {
        const analysis = analyzeMerge(sources)
        assert.deepEqual(analysis.differences, [])
        const out = buildMerged(sources, {}, 'v', NOW)
        assert.deepEqual(out.core, withCreds.core)
        assert.deepEqual(out.extensions, withCreds.extensions)
        assert.equal(out.meta.includesCredentials, true)
    }
})

test('🔴 the redaction adding a blank field, or its own notes (schemaKnown), is not a difference either', () => {
    // as seen in QA: cloud-config writes secretAccessKey '' where the source has none; an IdP adds schemaKnown
    const withCreds = bundle({}, [
        { type: EExtensionType.PROVIDER, id: 'cloud-config', config: { sources: [{ kind: 'aws', id: '1', auth: { kind: 'environment' } }] } },
        { type: EExtensionType.IDP, id: 'google', coreConfig: { instances: [{ id: 'g', config: { clientId: 'c', clientSecret: 's' } }] } }
    ], true)
    const without = bundle({}, [
        { type: EExtensionType.PROVIDER, id: 'cloud-config', config: { sources: [{ kind: 'aws', id: '1', auth: { kind: 'environment' }, secretAccessKey: '' }] } },
        { type: EExtensionType.IDP, id: 'google', coreConfig: { instances: [{ id: 'g', config: { clientId: 'c', clientSecret: '' } }], schemaKnown: true } }
    ], false)
    const sources = [src('This Kwirth', without), src('file', withCreds)]
    assert.deepEqual(analyzeMerge(sources).differences, [])
    assert.deepEqual(buildMerged(sources, {}, 'v', NOW).extensions, withCreds.extensions)
})

test('a real difference next to a blanked secret is still asked, and only the real field is named', () => {
    const withCreds = bundle({ settings: { marketplaces: [{ ...mkt('acme', 'https://a'), manifestAuth: { type: 'private-token', token: 'glpat-1' } }] } }, [], true)
    const without = bundle({ settings: { marketplaces: [{ ...mkt('acme', 'https://other'), manifestAuth: { type: 'private-token' } }] } }, [], false)
    const analysis = analyzeMerge([src('file', withCreds), src('This Kwirth', without)])
    assert.equal(analysis.differences.length, 1)
    assert.deepEqual(analysis.differences[0].fields, ['url'])
})

test('between two sources WITH credentials, a blank is a real value: it differs', () => {
    const a = bundle({ sharedAi: { providers: [{ name: 'openai', key: 'sk-1' }] } }, [], true)
    const b = bundle({ sharedAi: { providers: [{ name: 'openai', key: '' }] } }, [], true)
    const analysis = analyzeMerge([src('a', a), src('b', b)])
    assert.equal(analysis.differences.length, 1)
    assert.deepEqual(analysis.differences[0].fields, ['key'])
})

test('an absent NON-secret field is a real difference even without credentials', () => {
    const a = bundle({ settings: { marketplaces: [mkt('acme', 'https://a')] } }, [], true)
    const b = bundle({ settings: { marketplaces: [{ id: 'acme', url: 'https://a', enabled: true }] } }, [], false)
    assert.deepEqual(analyzeMerge([src('a', a), src('b', b)]).differences[0].fields, ['label'])
})

// ── warnings ────────────────────────────────────────────────────────────────────────────────────────

test('an AI model whose provider no source carries is warned about, not removed', () => {
    const a = bundle({ sharedAi: { providers: [{ name: 'openai' }], llms: [{ id: 'gpt', provider: 'openai' }, { id: 'claude', provider: 'anthropic' }] } })
    const analysis = analyzeMerge([src('a', a)])
    assert.deepEqual(analysis.warnings, ["AI model 'claude' uses provider 'anthropic', which no source carries"])
    const out = buildMerged([src('a', a)], {}, 'v', NOW)
    assert.equal((out.core.sharedAi as { llms: unknown[] }).llms.length, 2)
})

test('the provider may come from another source: no warning', () => {
    const a = bundle({ sharedAi: { llms: [{ id: 'claude', provider: 'anthropic' }] } })
    const b = bundle({ sharedAi: { providers: [{ name: 'anthropic' }] } })
    assert.deepEqual(analyzeMerge([src('a', a), src('b', b)]).warnings, [])
})

// ── validateBundle (moved from the back end) ────────────────────────────────────────────────────────

test('validateBundle rejects what is not a readable Kwirth bundle', () => {
    assert.equal(validateBundle(bundle({})), undefined)
    assert.equal(validateBundle(null), 'not an object')
    assert.match(validateBundle({ kind: 'other' })!, /not a Kwirth configuration bundle/)
    assert.match(validateBundle({ ...bundle({}), formatVersion: CONFIG_BUNDLE_FORMAT_VERSION + 1 })!, /newer than supported/)
    assert.equal(validateBundle({ ...bundle({}), extensions: undefined }), 'missing extensions array')
    assert.equal(validateBundle({ ...bundle({}), core: undefined }), 'missing core section')
})
