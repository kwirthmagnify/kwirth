import { test } from 'node:test'
import assert from 'node:assert/strict'
import { senderConfigs, webhookConfigs, idpInstances, toolsetGrants, pluginInstallConfig } from '../../src/tools/CoreManagedConfig'
import { SenderManager } from '../../src/tools/SenderManager'
import { WebhookManager } from '../../src/tools/WebhookManager'
import { IdpManager } from '../../src/tools/IdpManager'
import { AiToolsetManager } from '../../src/tools/AiToolsetManager'
import { PluginManager } from '../../src/tools/PluginManager'

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
        setSenderStoredConfig: (_id: string, stored: unknown) => { written = stored },
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

const webhookFalso = (configs: unknown[], escritas: unknown[]): WebhookManager => ({
    getConfigs: () => configs,
    getWebhook: () => ({ getConfigSchema: () => [{ name: 'name', label: 'Name' }, { name: 'token', label: 'Token', type: 'password' }] }),
    setWebhookStoredConfig: (_id: string, stored: { configs: unknown[] }) => { escritas.push(...stored.configs); return true }
} as unknown as WebhookManager)

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
        setWebhookStoredConfig: () => false } as unknown as WebhookManager, 'fantasma')

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
    saveInstance: async (i: unknown) => { guardadas.push(i) },
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
    const manager = {
        listGrants: async () => ({ 'k8s-ops': ['agora', 'fantasma'] }),
        setGrants: async () => ['agora']
    } as unknown as AiToolsetManager

    const e = toolsetGrants(manager, 'k8s-ops')
    assert.deepEqual(await e.exportConfig!(opts(false)), { grants: ['agora', 'fantasma'] })

    const r = await e.importConfig!({ grants: ['agora', 'fantasma'] })
    assert.equal(r.applied, 1)
    assert.equal(r.skipped, 1)
    assert.ok(r.warnings[0].includes('fantasma'))
})

// ─── config de instalacion ─────────────────────────────────────────────────────

test('la config de instalacion de un plugin va y vuelve intacta', async () => {
    let guardada: unknown = undefined
    const manager = {
        getConfig: async () => ({ algo: 'valor' }),
        saveConfig: async (_id: string, cfg: unknown) => { guardada = cfg }
    } as unknown as PluginManager

    const e = pluginInstallConfig(manager, 'censor')
    const exportada = await e.exportConfig!(opts(false))
    assert.deepEqual(exportada, { installConfig: { algo: 'valor' } })

    await e.importConfig!(exportada)
    assert.deepEqual(guardada, { algo: 'valor' })
})

test('basura en el sitio de la config de instalacion no escribe nada', async () => {
    let escribio = false
    const manager = {
        getConfig: async () => ({}),
        saveConfig: async () => { escribio = true }
    } as unknown as PluginManager

    const e = pluginInstallConfig(manager, 'censor')
    const r = await e.importConfig!({ installConfig: 'esto no es un objeto' })
    assert.equal(escribio, false)
    assert.equal(r.applied, 0)
})
