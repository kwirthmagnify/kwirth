import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IKwirthSettings, IMarketplace } from '@kwirthmagnify/kwirth-common'
import { seedBuiltInMarketplaces } from '../../src/tools/MarketplaceManager'
import { IConfigMaps } from '../../src/tools/IConfigMap'

/*
    Offering a marketplace without imposing it.

    The whole point is the SECOND boot. Seeding is easy; what is easy to get wrong — and invisible until
    somebody complains — is seeding again after the admin deleted it, which turns 'you can remove it'
    into 'you can remove it until the next restart'.
*/

const SETTINGS_KEY = 'kwirth.settings'
const SEEDED_KEY = 'kwirth-seeded-marketplaces'

/* A ConfigMaps in memory: this is about what is stored, not about where. */
const fakeConfigMaps = (initial: Record<string, unknown> = {}) => {
    const store: Record<string, unknown> = { ...initial }
    const maps: IConfigMaps = {
        read: async (name: string, defaultValue?: unknown) => store[name] ?? defaultValue,
        write: async (name: string, data: unknown) => { store[name] = data },
        writeKey: async () => {},
        readAllKeys: async () => ({}),
        storeLimit: () => undefined
    }
    return { maps, store }
}

const marketplacesIn = (store: Record<string, unknown>): IMarketplace[] =>
    ((store[SETTINGS_KEY] as IKwirthSettings | undefined)?.marketplaces ?? [])

test('on the first boot the marketplace is offered, enabled', async () => {
    const { maps, store } = fakeConfigMaps()
    await seedBuiltInMarketplaces(maps)

    const list = marketplacesIn(store)
    assert.equal(list.length, 1)
    assert.equal(list[0].id, 'jfvilas')
    assert.equal(list[0].enabled, true)
    assert.match(list[0].url, /^https:\/\/raw\.githubusercontent\.com\/jfvilas\/kwirth\/.*manifest\.json$/)
    assert.deepEqual(store[SEEDED_KEY], ['jfvilas'], 'and it is written down as offered')
})

test('🔴 deleted by the admin, it does NOT come back on the next boot', async () => {
    const { maps, store } = fakeConfigMaps()
    await seedBuiltInMarketplaces(maps)

    // the admin removes it from the dialog: the settings lose it, the bookkeeping keeps it
    store[SETTINGS_KEY] = { marketplaces: [] }
    await seedBuiltInMarketplaces(maps)

    assert.deepEqual(marketplacesIn(store), [], 'it was removed on purpose and stays removed')
})

test('disabled by the admin, it is not re-enabled either', async () => {
    const { maps, store } = fakeConfigMaps()
    await seedBuiltInMarketplaces(maps)

    store[SETTINGS_KEY] = { marketplaces: marketplacesIn(store).map(m => ({ ...m, enabled: false })) }
    await seedBuiltInMarketplaces(maps)

    assert.equal(marketplacesIn(store)[0].enabled, false, 'switching it off is a decision, not a gap to fill')
})

test('seeding twice in a row adds it once, not twice', async () => {
    const { maps, store } = fakeConfigMaps()
    await seedBuiltInMarketplaces(maps)
    await seedBuiltInMarketplaces(maps)

    assert.equal(marketplacesIn(store).length, 1)
})

test('what the admin already configured by hand is left exactly as it was', async () => {
    const mine: IMarketplace = { id: 'jfvilas', url: 'https://my-own-mirror/manifest.json', label: 'Mine', enabled: false }
    const { maps, store } = fakeConfigMaps({ [SETTINGS_KEY]: { marketplaces: [mine] } })

    await seedBuiltInMarketplaces(maps)

    const list = marketplacesIn(store)
    assert.equal(list.length, 1, 'no duplicate with the same id')
    assert.deepEqual(list[0], mine, 'their url and their switch, untouched')
    assert.deepEqual(store[SEEDED_KEY], ['jfvilas'], 'and it counts as offered, so it is never reconsidered')
})

test('the other settings are not lost when the marketplace is added', async () => {
    const before: IKwirthSettings = { metricsInterval: 42, previousLogLines: 500 }
    const { maps, store } = fakeConfigMaps({ [SETTINGS_KEY]: before })

    await seedBuiltInMarketplaces(maps)

    const after = store[SETTINGS_KEY] as IKwirthSettings
    assert.equal(after.metricsInterval, 42)
    assert.equal(after.previousLogLines, 500)
    assert.equal(after.marketplaces?.length, 1)
})

test('a storage that fails does not stop Kwirth from starting', async () => {
    const maps: IConfigMaps = {
        read: async () => { throw new Error('storage down') },
        write: async () => {},
        writeKey: async () => {},
        readAllKeys: async () => ({}),
        storeLimit: () => undefined
    }
    // not being able to offer a marketplace is not a reason to refuse to boot
    await seedBuiltInMarketplaces(maps)
})
