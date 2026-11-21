import { test } from 'node:test'
import assert from 'node:assert/strict'
import { senderConfigs, webhookConfigs, idpInstances, toolsetCoreConfig, pluginInstallConfig, providerInstallConfig, routerInstallConfig, loginInstallConfig } from '../../src/tools/CoreManagedConfig'
import { ProviderManager } from '../../src/tools/ProviderManager'
import { RouterManager } from '../../src/tools/RouterManager'
import { LoginManager } from '../../src/tools/LoginManager'
import { SenderManager } from '../../src/tools/SenderManager'
import { WebhookManager } from '../../src/tools/WebhookManager'
import { IdpManager } from '../../src/tools/IdpManager'
import { AiToolsetManager } from '../../src/tools/AiToolsetManager'
import { PluginManager } from '../../src/tools/PluginManager'
import { registerToolset, unregisterToolset } from '@kwirthmagnify/kwirth-common-ai/back'
import { EToolEffect, EToolSensitivity } from '@kwirthmagnify/kwirth-common-ai'

/*
    The configuration the core stores ABOUT an extension.

    What is pinned down here is above all THAT NO SECRET ESCAPES. These configurations end up in a file
    that gets downloaded to somebody's downloads folder, and the core does not know by itself which of
    their fields are passwords: the schema each extension publishes tells it. A failure here does not give
    an error, it gives a password in the clear in a file — and it goes unnoticed.
*/

const opts = (includeCredentials: boolean) => ({ includeCredentials })

/*
    There was a `combine()` here until 2026-10-29 that merged this file's interlocutor with the
    extension's own into a single one. It no longer exists: the two parts travel in two fields of the
    bundle and never meet. What used to be tested here —that both are asked, that one missing does not
    cancel the other, that the warnings of both come out— is now where the joining happens, in
    `configBundle.test.ts`.
*/

// ─── senders: emptying the secrets ─────────────────────────────────────────────

// The mock returns the stored config (base fields + configs array) the way SenderManager does.
// getSenderStoredConfig returns both; setSenderStoredConfig captures what was written for import tests.
const senderFalso = (schema: unknown, configs: unknown[]): SenderManager => {
    let written: unknown
    return {
        getConfigs: () => configs,
        getSenderStoredConfig: () => ({ configs }),
        setSenderStoredConfig: async (_id: string, stored: unknown) => { written = stored; return [] },
        getSender: () => schema === undefined ? undefined : ({ getConfigSchema: () => schema }),
        addConfig: () => true
    } as unknown as SenderManager
}

const CONFIG_SMTP = { name: 'correo', host: 'smtp.example.com', user: 'kwirth', password: 'la-buena' }
const SCHEMA_SMTP = [
    { name: 'name', label: 'Name' },
    { name: 'host', label: 'Host' },
    { name: 'user', label: 'User' },
    { name: 'password', label: 'Password', type: 'password' }
]

test('con credenciales, la configuracion de un sender viaja entera', async () => {
    const e = senderConfigs(senderFalso(SCHEMA_SMTP, [CONFIG_SMTP]), 'email')
    const r = await e.exportConfig!(opts(true)) as { stored: { configs: { password: string }[] } }
    assert.equal(r.stored.configs[0].password, 'la-buena')
})

test('sin credenciales, el campo secreto se VACIA — no se omite', async () => {
    // Emptying it rather than removing it is deliberate: the destination has to be able to say which one to fill in.
    const e = senderConfigs(senderFalso(SCHEMA_SMTP, [CONFIG_SMTP]), 'email')
    const r = await e.exportConfig!(opts(false)) as { stored: { configs: Record<string, unknown>[] } }
    assert.equal(r.stored.configs[0].password, '')
    assert.ok('password' in r.stored.configs[0])
    assert.equal(r.stored.configs[0].host, 'smtp.example.com', 'lo que no es secreto no se toca')
})

test('🔴 sin credenciales, un textarea marcado secret (una clave SSH) se vacia igual que un password', async () => {
    // IConfigFieldDef.secret (kwirth-common 0.5.86): a multi-line secret is not type 'password', and the
    // export used to ask only for that — the key would have travelled in clear.
    const schema = [
        { name: 'name', label: 'Name' },
        { name: 'script', label: 'Script', type: 'textarea' },
        { name: 'sshPrivateKey', label: 'SSH private key', type: 'textarea', secret: true },
        { name: 'sshPassword', label: 'SSH password', type: 'password' }
    ]
    const config = { name: 'remoto', script: 'echo hi\n', sshPrivateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\n-----END OPENSSH PRIVATE KEY-----', sshPassword: 'pw' }
    const e = senderConfigs(senderFalso(schema, [config]), 'script')
    const r = await e.exportConfig!(opts(false)) as { stored: { configs: Record<string, unknown>[] } }
    assert.equal(r.stored.configs[0].sshPrivateKey, '')
    assert.equal(r.stored.configs[0].sshPassword, '')
    assert.equal(r.stored.configs[0].script, 'echo hi\n', 'a textarea that is not secret travels intact')
})

test('un sender SIN esquema no exporta nada, en vez de arriesgarse', async () => {
    // With no schema the core does not know which field is the password. Between omitting the
    // configuration and writing a secret in the clear into a file that ends up in Downloads, it omits.
    const e = senderConfigs(senderFalso(undefined, [CONFIG_SMTP]), 'email')
    const r = await e.exportConfig!(opts(false)) as { stored: { configs: unknown[] }, omitted: number }
    assert.deepEqual(r.stored.configs, [])
    assert.equal(r.omitted, 1)
})

test('y quien importe ese fichero se entera de que faltan', async () => {
    const e = senderConfigs(senderFalso(SCHEMA_SMTP, []), 'email')
    const r = await e.importConfig!({ stored: { configs: [] }, omitted: 2 })
    assert.ok(r.warnings[0].includes('does not declare which of its fields are secret'))
})

// ─── webhooks: the same, and they REPLACE ──────────────────────────────────────

const SCHEMA_WEBHOOK = [
    { name: 'name', label: 'Name' },
    { name: 'region', label: 'Region', common: true },
    { name: 'apiKey', label: 'API key', type: 'password', common: true },
    { name: 'token', label: 'Token', type: 'password' }
]

const webhookFalso = (configs: unknown[], escritas: unknown[], base: Record<string, unknown> = {}, documentos: unknown[] = []): WebhookManager => ({
    getConfigs: () => configs,
    getWebhookStoredConfig: () => ({ ...base, configs }),
    getWebhook: () => ({ getConfigSchema: () => SCHEMA_WEBHOOK }),
    setWebhookStoredConfig: async (_id: string, stored: { configs: unknown[] }) => { escritas.push(...stored.configs); documentos.push(stored); return [] }
} as unknown as WebhookManager)

test('🔴 a webhook exports its BASE with its configs (it used to be lost), and the import puts both back', async () => {
    const base = { region: 'eu', apiKey: 'k-real' }
    const documentos: unknown[] = []
    const e = webhookConfigs(webhookFalso([{ name: 'jira', token: 't-real' }], [], base, documentos), 'jira')

    const conCredenciales = await e.exportConfig!(opts(true))
    assert.deepEqual(conCredenciales, { stored: { region: 'eu', apiKey: 'k-real', configs: [{ name: 'jira', token: 't-real' }] } })

    const r = await e.importConfig!(conCredenciales)
    assert.deepEqual(documentos, [{ region: 'eu', apiKey: 'k-real', configs: [{ name: 'jira', token: 't-real' }] }])
    assert.equal(r.applied, 1)
})

test('🔴 without credentials a webhook empties the secrets of its base AND of each config', async () => {
    const e = webhookConfigs(webhookFalso([{ name: 'jira', token: 't-real' }], [], { region: 'eu', apiKey: 'k-real' }), 'jira')
    assert.deepEqual(await e.exportConfig!(opts(false)), { stored: { region: 'eu', apiKey: '', configs: [{ name: 'jira', token: '' }] } })
})

test('a webhook file written before S7 (bare configs, no base) is still imported', async () => {
    const documentos: unknown[] = []
    const e = webhookConfigs(webhookFalso([], [], {}, documentos), 'jira')
    const r = await e.importConfig!({ configs: [{ name: 'vieja' }] })
    assert.deepEqual(documentos, [{ configs: [{ name: 'vieja' }] }])
    assert.equal(r.applied, 1)
})

test('a webhook with no schema exports none of its values, and the import says why', async () => {
    const e = webhookConfigs({ getWebhookStoredConfig: () => ({ apiKey: 'k', configs: [{ name: 'a' }] }), getWebhook: () => ({}) } as unknown as WebhookManager, 'jira')
    const exportado = await e.exportConfig!(opts(false))
    assert.deepEqual(exportado, { stored: { configs: [] }, omitted: 1 })
    const r = await webhookConfigs(webhookFalso([], []), 'jira').importConfig!(exportado)
    assert.ok(r.warnings.some(w => w.includes('does not declare which of its fields are secret')))
})

test('a sender base loses its secrets too when exported without credentials', async () => {
    const e = senderConfigs({
        getSenderStoredConfig: () => ({ host: 'smtp', password: 'base-pw', configs: [CONFIG_SMTP] }),
        getSender: () => ({ getConfigSchema: () => SCHEMA_SMTP })
    } as unknown as SenderManager, 'email')
    const r = await e.exportConfig!(opts(false)) as { stored: Record<string, unknown> & { configs: Record<string, unknown>[] } }
    assert.equal(r.stored.password, '')
    assert.equal(r.stored.host, 'smtp')
    assert.equal(r.stored.configs[0].password, '')
})

test('🔴 an imported sender document that does not fit its schema is not applied, and says why', async () => {
    const e = senderConfigs({
        getSender: () => ({ getConfigSchema: () => SCHEMA_SMTP }),
        setSenderStoredConfig: async () => [{ field: 'host', message: "Config 'correo': 'Host' is required" }]
    } as unknown as SenderManager, 'email')
    const r = await e.importConfig!({ stored: { configs: [{ name: 'correo' }] } })
    assert.equal(r.applied, 0)
    assert.equal(r.skipped, 1)
    assert.ok(r.warnings.some(w => w.includes("'Host' is required")))
})

test('🔴 el import de un webhook REEMPLAZA la lista entera', async () => {
    /*
        Antes era un `addConfig` por cada entrante: las que ya habia y no venian se quedaban, asi que
        importar nunca dejaba al destino igual que al origen. Ahora lo que queda es exactamente lo que
        traia el fichero — la misma regla que el sender, y que todo lo demas.

        ⚠️ Un webhook pierde ademas el TOKEN de lo que se va, que es la URL por la que le llaman desde
        fuera: hay que repegarla en quien llame. Es la consecuencia de traerse otra configuracion.
    */
    const escritas: unknown[] = []
    const e = webhookConfigs(webhookFalso([{ name: 'vieja' }], escritas), 'gitlab')

    const r = await e.importConfig!({ configs: [{ name: 'nueva' }] })

    assert.deepEqual(escritas, [{ name: 'nueva' }], 'no ha reemplazado: esperaba solo la del fichero')
    assert.equal(r.applied, 1)
})

test('un webhook que no esta registrado aqui no aplica nada, y lo dice', async () => {
    const e = webhookConfigs({ getConfigs: () => [], getWebhook: () => undefined,
        setWebhookStoredConfig: async () => { throw new Error('must not be called') } } as unknown as WebhookManager, 'fantasma')

    const r = await e.importConfig!({ configs: [{ name: 'una' }] })

    assert.equal(r.applied, 0)
    assert.equal(r.skipped, 1)
    assert.ok(r.warnings.some(w => w.includes('not registered')))
})

// ─── idp: instances per connector ──────────────────────────────────────────────

const INSTANCIAS = {
    uno: { id: 'uno', connectorId: 'github-cloud', label: 'GitHub', enabled: true, config: { clientId: 'x', clientSecret: 'secreto' } },
    dos: { id: 'dos', connectorId: 'gitlab-cloud', label: 'GitLab', enabled: true, config: { clientId: 'y', clientSecret: 'otro' } }
}

const idpFalso = (guardadas: unknown[] = [], borradas: string[] = []): IdpManager => ({
    exportConfig: async () => INSTANCIAS,
    getConnectorSchema: () => [
        { name: 'clientId', label: 'Client id' },
        { name: 'clientSecret', label: 'Client secret', type: 'password' }
    ],
    saveInstance: async (i: unknown) => { guardadas.push(i); return [] },
    deleteInstance: async (id: string) => { borradas.push(id) }
} as unknown as IdpManager)

test('un conector exporta SOLO sus instancias, no las de otro conector', async () => {
    // The relation is 1 connector -> N instances, and each instance says which one it belongs to.
    const e = idpInstances(idpFalso(), 'github-cloud')
    const r = await e.exportConfig!(opts(true)) as { instances: { id: string }[] }
    assert.equal(r.instances.length, 1)
    assert.equal(r.instances[0].id, 'uno')
})

test('el clientSecret se vacia por esquema cuando no se piden credenciales', async () => {
    const e = idpInstances(idpFalso(), 'github-cloud')
    const r = await e.exportConfig!(opts(false)) as { instances: { config: Record<string, unknown> }[], schemaKnown: boolean }
    assert.equal(r.instances[0].config.clientSecret, '')
    assert.equal(r.instances[0].config.clientId, 'x', 'el id no es secreto')
    assert.equal(r.schemaKnown, true)
})

test('una instancia que no es de este conector se descarta al importar', async () => {
    const guardadas: unknown[] = []
    const e = idpInstances(idpFalso(guardadas), 'github-cloud')
    const r = await e.importConfig!({ instances: [INSTANCIAS.uno, INSTANCIAS.dos] })
    assert.equal(r.applied, 1)
    assert.equal(r.skipped, 1)
    assert.equal(guardadas.length, 1)
    assert.ok(r.warnings[0].includes('does not belong'))
})

test('🔴 una instancia que esta aqui y NO viene en el fichero se BORRA', async () => {
    /*
        El import REEMPLAZA: lo que queda es exactamente lo que traia el fichero. Antes era un
        `saveInstance` por cada entrante y nunca quitaba nada, asi que importar no podia dejar al
        destino igual que al origen — se quedaba con lo suyo ADEMAS de lo importado.
    */
    const borradas: string[] = []
    const e = idpInstances(idpFalso([], borradas), 'github-cloud')

    // El fichero no trae 'uno', que es la unica instancia de este conector que hay aqui.
    const r = await e.importConfig!({ instances: [] })

    assert.deepEqual(borradas, ['uno'])
    assert.equal(r.applied, 0)
})

test('🔴 y NO se tocan las instancias de OTROS conectores', async () => {
    /*
        El fichero habla de un conector, no de todos. Borrar lo que no menciona seria pasarse de lo que
        se ha pedido: 'dos' es de gitlab-cloud y su entrada del bundle es otra.
    */
    const borradas: string[] = []
    const e = idpInstances(idpFalso([], borradas), 'github-cloud')

    await e.importConfig!({ instances: [] })

    assert.equal(borradas.includes('dos'), false, 'ha borrado la instancia de otro conector')
})

// ─── toolsets: grants that reference plugins ───────────────────────────────────

test('una concesion a un plugin que no esta instalado aqui se avisa', async () => {
    // `setGrants` returns those that WERE applied: the difference is what was lost along the way.
    const agora = { pluginId: 'agora', allTools: true, tools: [] }
    const fantasma = { pluginId: 'fantasma', allTools: true, tools: [] }
    const manager = {
        listGrants: async () => ({ 'k8s-ops': [agora, fantasma] }),
        setGrants: async () => [agora],
        getSavedConfig: async () => undefined
    } as unknown as AiToolsetManager

    const e = toolsetCoreConfig(manager, 'k8s-ops')
    assert.deepEqual(await e.exportConfig!(opts(false)), { grants: [agora, fantasma] })

    const r = await e.importConfig!({ grants: [agora, fantasma] })
    assert.equal(r.applied, 1)
    assert.equal(r.skipped, 1)
    assert.ok(r.warnings[0].includes('fantasma'))
})

test('importar una concesion en formato antiguo se salta y se avisa', async () => {
    let recibido: unknown = undefined
    const manager = {
        listGrants: async () => ({}),
        setGrants: async (_id: string, g: unknown[]) => { recibido = g; return g }
    } as unknown as AiToolsetManager

    const r = await toolsetCoreConfig(manager, 'k8s-ops').importConfig!({ grants: ['agora', { pluginId: 'p', allTools: true, tools: [] }] })
    assert.deepEqual(recibido, [{ pluginId: 'p', allTools: true, tools: [] }])
    assert.equal(r.applied, 1)
    assert.equal(r.skipped, 1)
    assert.ok(r.warnings[0].includes('obsolete'))
})

test('importar tools que el toolset de destino no tiene las quita y avisa, sin tumbar el import', async () => {
    registerToolset({
        id: 'cmc-toolset', version: '0.0.1', displayName: 'x', description: 'x', requires: [],
        tools: [{ name: 'ping', description: 'p', effect: EToolEffect.READ, sensitivity: EToolSensitivity.PUBLIC, inputSchema: {} as never, execute: async () => 'pong' }]
    })
    let recibido: unknown = undefined
    const manager = {
        listGrants: async () => ({}),
        setGrants: async (_id: string, g: unknown[]) => { recibido = g; return g }
    } as unknown as AiToolsetManager

    const r = await toolsetCoreConfig(manager, 'cmc-toolset').importConfig!({ grants: [{ pluginId: 'p', allTools: false, tools: ['ping', 'nueva'] }] })
    assert.deepEqual(recibido, [{ pluginId: 'p', allTools: false, tools: ['ping'] }])
    assert.equal(r.applied, 1)
    assert.ok(r.warnings.some(w => w.includes('nueva')))
    unregisterToolset('cmc-toolset')
})

// ─── toolset settings beside its grants (S8) ───────────────────────────────────

const toolsetFake = (saved: Record<string, unknown> | undefined, schema: unknown[], written: unknown[] = []): AiToolsetManager => ({
    listGrants: async () => ({}),
    setGrants: async (_id: string, g: unknown[]) => g,
    getSavedConfig: async () => saved,
    getConfigSchema: () => schema,
    saveConfig: async (_id: string, c: unknown) => { written.push(c); return [] }
} as unknown as AiToolsetManager)

const TOOLSET_SCHEMA = [{ name: 'namespace', label: 'Namespace' }, { name: 'token', label: 'Token', type: 'password' }]

test('🔴 a toolset exports its settings beside its grants: secrets emptied without credentials, real with them', async () => {
    const e = toolsetCoreConfig(toolsetFake({ namespace: 'apps', token: 't-real' }, TOOLSET_SCHEMA), 'k8s-deploy')
    assert.deepEqual(await e.exportConfig!(opts(false)), { grants: [], config: { namespace: 'apps', token: '' } })
    assert.deepEqual(await e.exportConfig!(opts(true)), { grants: [], config: { namespace: 'apps', token: 't-real' } })
})

test('a toolset with no saved settings exports only its grants, as before', async () => {
    assert.deepEqual(await toolsetCoreConfig(toolsetFake(undefined, TOOLSET_SCHEMA), 'k8s-ops').exportConfig!(opts(true)), { grants: [] })
})

test('🔴 importing puts grants AND settings back; a file with only grants (before S8) leaves the settings alone', async () => {
    const written: unknown[] = []
    const e = toolsetCoreConfig(toolsetFake(undefined, TOOLSET_SCHEMA, written), 'k8s-deploy')
    const r = await e.importConfig!({ grants: [{ pluginId: 'p', allTools: true, tools: [] }], config: { namespace: 'apps', token: 't' } })
    assert.deepEqual(written, [{ namespace: 'apps', token: 't' }])
    assert.equal(r.applied, 2)
    await e.importConfig!({ grants: [] })
    assert.equal(written.length, 1, 'no settings in the file, none written')
})

test('a toolset with no schema: its settings do not travel without credentials, and the import says why', async () => {
    const exportado = await toolsetCoreConfig(toolsetFake({ a: 1 }, []), 'x').exportConfig!(opts(false))
    assert.deepEqual(exportado, { grants: [], configOmitted: 1 })
    const r = await toolsetCoreConfig(toolsetFake(undefined, TOOLSET_SCHEMA), 'x').importConfig!(exportado)
    assert.ok(r.warnings.some(w => w.includes('does not declare which of its fields are secret')))
})

// ─── config de instalacion ─────────────────────────────────────────────────────

/*
    Plugin, provider, router and login: ONE configuration each, the same rules for the four (S7). Before
    it, provider and plugin went out with their passwords in clear without credentials, and routers and
    logins did not travel at all.
*/

const SCHEMA_INSTALL = [
    { name: 'url', label: 'URL' },
    { name: 'password', label: 'Password', type: 'password' },
    { name: 'key', label: 'Key', type: 'textarea', secret: true }
]
const SAVED_INSTALL = { url: 'https://x', password: 'pw-real', key: 'k-real' }

interface IInstallFake {
    saved: Record<string, unknown> | undefined
    schema: unknown[]
    written: unknown[]
    answer: () => Promise<unknown[]>
}

// Each family's manager, faked with the methods its adapter uses: the shape differs, the rules do not.
const FAMILIES: { family: string, adapter: (f: IInstallFake) => ReturnType<typeof pluginInstallConfig> }[] = [
    { family: 'plugin', adapter: f => pluginInstallConfig({
        getSavedConfig: async () => f.saved, getConfigSchema: () => f.schema,
        saveConfig: async (_id: string, c: unknown) => { f.written.push(c); return f.answer() } } as unknown as PluginManager, 'p') },
    { family: 'provider', adapter: f => providerInstallConfig({
        getSavedConfig: async () => f.saved, getSchemaAsync: async () => f.schema.length ? f.schema : undefined,
        saveConfig: async (_id: string, c: unknown) => { f.written.push(c); return f.answer() } } as unknown as ProviderManager, 'p') },
    { family: 'router', adapter: f => routerInstallConfig({
        getSavedConfig: async () => f.saved, getSchema: () => f.schema,
        saveConfig: async (_id: string, c: unknown) => { f.written.push(c); return f.answer() } } as unknown as RouterManager, 'p') },
    { family: 'login', adapter: f => loginInstallConfig({
        getSavedConfig: async () => f.saved, getConfigSchema: () => f.schema,
        saveConfig: async (_id: string, c: unknown) => { f.written.push(c); return f.answer() } } as unknown as LoginManager, 'p') }
]

const fake = (over: Partial<IInstallFake> = {}): IInstallFake =>
    ({ saved: SAVED_INSTALL, schema: SCHEMA_INSTALL, written: [], answer: async () => [], ...over })

for (const { family, adapter } of FAMILIES) {
    test(`🔴 ${family}: with credentials the config travels whole, and comes back the same`, async () => {
        const f = fake()
        const e = adapter(f)
        const exportado = await e.exportConfig!(opts(true))
        assert.deepEqual(exportado, { installConfig: SAVED_INSTALL })
        const r = await e.importConfig!(exportado)
        assert.deepEqual(f.written, [SAVED_INSTALL])
        assert.equal(r.applied, 1)
    })

    test(`🔴 ${family}: without credentials every secret field is EMPTIED (password and secret textarea), the rest intact`, async () => {
        const exportado = await adapter(fake()).exportConfig!(opts(false))
        assert.deepEqual(exportado, { installConfig: { url: 'https://x', password: '', key: '' } })
    })

    test(`${family}: nothing saved, nothing travels — not even the defaults`, async () => {
        assert.equal(await adapter(fake({ saved: undefined })).exportConfig!(opts(true)), undefined)
        assert.equal(await adapter(fake({ saved: {} })).exportConfig!(opts(false)), undefined)
    })

    test(`🔴 ${family}: with no schema the values do not travel without credentials, and the import says why`, async () => {
        const exportado = await adapter(fake({ schema: [] })).exportConfig!(opts(false))
        assert.deepEqual(exportado, { omitted: 1 })
        const f = fake()
        const r = await adapter(f).importConfig!(exportado)
        assert.deepEqual(f.written, [], 'nothing written')
        assert.equal(r.skipped, 1)
        assert.match(r.warnings[0], /does not declare which of its fields are secret/)
    })

    test(`${family}: an imported config that does not fit is not applied, and the warning says why`, async () => {
        const f = fake({ answer: async () => [{ field: 'url', message: `'URL' is required` }] })
        const r = await adapter(f).importConfig!({ installConfig: { otra: 'cosa' } })
        assert.equal(r.applied, 0)
        assert.equal(r.skipped, 1)
        assert.match(r.warnings[0], /'p'.*'URL' is required/)
    })

    test(`${family}: a save that THROWS (a login not here, a router refusing it) is a warning, not a broken import`, async () => {
        const f = fake({ answer: async () => { throw new Error("Login extension 'p' not found") } })
        const r = await adapter(f).importConfig!({ installConfig: { url: 'u' } })
        assert.equal(r.applied, 0)
        assert.match(r.warnings[0], /not found/)
    })

    test(`${family}: rubbish where the config goes writes nothing`, async () => {
        const f = fake()
        for (const basura of [{ installConfig: 'no es un objeto' }, { installConfig: [1, 2] }, null, 'x']) {
            assert.equal((await adapter(f).importConfig!(basura)).applied, 0)
        }
        assert.deepEqual(f.written, [])
    })
}
