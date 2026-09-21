import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IExtension } from '@kwirthmagnify/kwirth-common-back'
import { combine, senderConfigs, idpInstances, toolsetGrants, pluginInstallConfig } from '../../src/tools/CoreManagedConfig'
import { SenderManager } from '../../src/tools/SenderManager'
import { IdpManager } from '../../src/tools/IdpManager'
import { AiToolsetManager } from '../../src/tools/AiToolsetManager'
import { PluginManager } from '../../src/tools/PluginManager'

/*
    La configuracion que el core guarda DE una extension.

    Lo que se fija aqui es sobre todo QUE NO SE ESCAPE UN SECRETO. Estas configuraciones acaban en un
    fichero que se descarga a la carpeta de descargas de alguien, y el core no sabe por si mismo cuales
    de sus campos son contraseñas: se lo dice el esquema que publica cada extension. Un fallo aqui no da
    error, da una contraseña en claro en un fichero — y no se nota.
*/

const opts = (includeCredentials: boolean) => ({ includeCredentials })

// ─── combine ───────────────────────────────────────────────────────────────────

const soloCore: IExtension = {
    exportConfig: async () => ({ delCore: 1 }),
    importConfig: async () => ({ applied: 1, skipped: 0, warnings: ['aviso del core'] })
}

const conPropio: IExtension = {
    exportConfig: async () => ({ suyo: 2 }),
    importConfig: async () => ({ applied: 3, skipped: 1, warnings: ['aviso propio'] })
}

test('sin nada propio, el interlocutor es el core tal cual', async () => {
    const c = combine(soloCore, undefined)
    assert.deepEqual(await c.exportConfig!(opts(false)), { delCore: 1 })
})

test('una extension que no implementa el contrato no envuelve nada', async () => {
    // Es el caso mayoritario hoy: la extension existe pero no tiene los metodos.
    const c = combine(soloCore, { } as IExtension)
    assert.deepEqual(await c.exportConfig!(opts(false)), { delCore: 1 })
})

test('con las dos fuentes, el contenido lleva las dos partes separadas', async () => {
    const c = combine(soloCore, conPropio)
    assert.deepEqual(await c.exportConfig!(opts(false)), { core: { delCore: 1 }, own: { suyo: 2 } })
})

test('al importar se suman los dos resultados, avisos incluidos', async () => {
    const c = combine(soloCore, conPropio)
    const r = await c.importConfig!({ core: {}, own: {} })
    assert.equal(r.applied, 4)
    assert.equal(r.skipped, 1)
    assert.deepEqual(r.warnings, ['aviso del core', 'aviso propio'])
})

test('si el fichero no trae la parte propia, solo se aplica la del core', async () => {
    // Pasa con un bundle generado cuando la extension aun no implementaba el contrato.
    const c = combine(soloCore, conPropio)
    const r = await c.importConfig!({ core: {} })
    assert.equal(r.applied, 1)
})

// ─── senders: el vaciado de secretos ───────────────────────────────────────────

const senderFalso = (schema: unknown, configs: unknown[]): SenderManager => ({
    getConfigs: () => configs,
    getSender: () => schema === undefined ? undefined : ({ getConfigSchema: () => schema }),
    addConfig: () => true
} as unknown as SenderManager)

const CONFIG_SMTP = { name: 'correo', host: 'smtp.example.com', user: 'kwirth', password: 'la-buena' }
const SCHEMA_SMTP = [
    { name: 'name', label: 'Name' },
    { name: 'host', label: 'Host' },
    { name: 'user', label: 'User' },
    { name: 'password', label: 'Password', type: 'password' }
]

test('con credenciales, la configuracion de un sender viaja entera', async () => {
    const e = senderConfigs(senderFalso(SCHEMA_SMTP, [CONFIG_SMTP]), 'email')
    const r = await e.exportConfig!(opts(true)) as { configs: { password: string }[] }
    assert.equal(r.configs[0].password, 'la-buena')
})

test('sin credenciales, el campo secreto se VACIA — no se omite', async () => {
    // Vaciarlo y no quitarlo es deliberado: el destino tiene que poder decir cual hay que rellenar.
    const e = senderConfigs(senderFalso(SCHEMA_SMTP, [CONFIG_SMTP]), 'email')
    const r = await e.exportConfig!(opts(false)) as { configs: Record<string, unknown>[] }
    assert.equal(r.configs[0].password, '')
    assert.ok('password' in r.configs[0])
    assert.equal(r.configs[0].host, 'smtp.example.com', 'lo que no es secreto no se toca')
})

test('un sender SIN esquema no exporta nada, en vez de arriesgarse', async () => {
    // Sin esquema el core no sabe que campo es la contraseña. Entre omitir la configuracion o escribir
    // un secreto en claro en un fichero que acaba en Descargas, se omite.
    const e = senderConfigs(senderFalso(undefined, [CONFIG_SMTP]), 'email')
    const r = await e.exportConfig!(opts(false)) as { configs: unknown[], omitted: number }
    assert.deepEqual(r.configs, [])
    assert.equal(r.omitted, 1)
})

test('y quien importe ese fichero se entera de que faltan', async () => {
    const e = senderConfigs(senderFalso(SCHEMA_SMTP, []), 'email')
    const r = await e.importConfig!({ configs: [], omitted: 2 })
    assert.ok(r.warnings[0].includes('does not declare which of its fields are secret'))
})

// ─── idp: instancias por conector ──────────────────────────────────────────────

const INSTANCIAS = {
    uno: { id: 'uno', connectorId: 'github-cloud', label: 'GitHub', enabled: true, config: { clientId: 'x', clientSecret: 'secreto' } },
    dos: { id: 'dos', connectorId: 'gitlab-cloud', label: 'GitLab', enabled: true, config: { clientId: 'y', clientSecret: 'otro' } }
}

const idpFalso = (guardadas: unknown[] = []): IdpManager => ({
    exportConfig: async () => INSTANCIAS,
    getConnectorSchema: () => [
        { name: 'clientId', label: 'Client id' },
        { name: 'clientSecret', label: 'Client secret', type: 'password' }
    ],
    saveInstance: async (i: unknown) => { guardadas.push(i) }
} as unknown as IdpManager)

test('un conector exporta SOLO sus instancias, no las de otro conector', async () => {
    // La relacion es 1 conector -> N instancias, y cada instancia dice a cual pertenece.
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

// ─── toolsets: concesiones que referencian plugins ─────────────────────────────

test('una concesion a un plugin que no esta instalado aqui se avisa', async () => {
    // `setGrants` devuelve los que SI se aplicaron: la diferencia es lo que se perdio por el camino.
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
