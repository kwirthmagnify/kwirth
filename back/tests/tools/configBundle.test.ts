import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EExtensionType, EBundleEntryStatus, IConfigBundle, CONFIG_BUNDLE_KIND, CONFIG_BUNDLE_FORMAT_VERSION, CORE_SETTINGS_KEY, IExtensionImportResult } from '@kwirthmagnify/kwirth-common'
import { ConfigBundleManager, exportStatusOf, importStatusOf, validateBundle, IExtensionRef, ICorePortableConfig } from '../../src/tools/ConfigBundleManager'

/*
    Portabilidad de configuracion. Lo que se fija aqui es el REPARTO: el core transporta y no interpreta.

    Por eso casi ningun test mira el contenido de una configuracion —no hay nada que mirar, es opaco—
    sino QUE PASA cuando el destinatario no esta, no implementa el contrato o revienta. Ahi es donde un
    despiste produce el peor resultado posible: un fichero que parece completo y no lo esta, o un import
    que se queda a medias sin decirlo.
*/

const refConInstancia = (id: string, exporta = true, importa = true, version = '1.0.0'): IExtensionRef => ({
    type: EExtensionType.PLUGIN,
    id,
    displayName: id,
    version,
    instance: {
        exportConfig: exporta ? async (opts) => ({ id, secreto: opts.includeCredentials ? 'valor-real' : '' }) : undefined,
        importConfig: importa ? async (): Promise<IExtensionImportResult> => ({ applied: 1, skipped: 0, warnings: [] }) : undefined
    }
})

const coreFalso = (): ICorePortableConfig & { settings: unknown, sharedAi: unknown } => {
    const estado = {
        settings: { metricsInterval: 30 } as unknown,
        sharedAi: { llms: ['uno'] } as unknown,
        readSettings: async () => estado.settings,
        writeSettings: async (d: unknown) => { estado.settings = d },
        readSharedAi: async (cred: boolean) => cred ? estado.sharedAi : { llms: ['uno'], apiKey: '' },
        writeSharedAi: async (d: unknown) => { estado.sharedAi = d }
    }
    return estado
}

// ─── el estado de una entrada ──────────────────────────────────────────────────

test('una extension con instancia y metodo se puede exportar', () => {
    assert.equal(exportStatusOf(refConInstancia('a')), EBundleEntryStatus.AVAILABLE)
})

test('con instancia pero sin metodo: no soporta el contrato, que es OPCIONAL', () => {
    assert.equal(exportStatusOf(refConInstancia('a', false)), EBundleEntryStatus.NOT_SUPPORTED)
})

test('sin instancia no hay a quien preguntar, y eso NO es lo mismo que no soportarlo', () => {
    // Un canal no requerido, o anunciado como REMOTE, esta instalado pero no instanciado. Son dos
    // mensajes distintos para el usuario: uno se arregla usando el plugin, el otro esperando a su autor.
    const ref: IExtensionRef = { type: EExtensionType.PLUGIN, id: 'a', displayName: 'a' }
    assert.equal(exportStatusOf(ref), EBundleEntryStatus.NOT_INSTANTIATED)
})

test('al importar, "no instalada" gana a cualquier otra causa', () => {
    const entry = { type: EExtensionType.PLUGIN, id: 'fantasma', config: {} }
    assert.equal(importStatusOf(entry, undefined), EBundleEntryStatus.NOT_INSTALLED)
})

test('una version distinta avisa, pero deja importar', () => {
    const entry = { type: EExtensionType.PLUGIN, id: 'a', version: '2.0.0', config: {} }
    assert.equal(importStatusOf(entry, refConInstancia('a', true, true, '1.0.0')), EBundleEntryStatus.VERSION_DIFFERS)
})

test('sin version en el bundle no se inventa un aviso de version', () => {
    const entry = { type: EExtensionType.PLUGIN, id: 'a', config: {} }
    assert.equal(importStatusOf(entry, refConInstancia('a')), EBundleEntryStatus.AVAILABLE)
})

// ─── validacion del envoltorio ─────────────────────────────────────────────────

const bundleBueno = (extensions: IConfigBundle['extensions'] = []): IConfigBundle => ({
    kind: CONFIG_BUNDLE_KIND,
    formatVersion: CONFIG_BUNDLE_FORMAT_VERSION,
    meta: { exportedAt: '2026-09-21T00:00:00.000Z', kwirthVersion: '0.6.31', includesCredentials: false },
    core: {},
    extensions
})

test('un bundle bien formado pasa', () => {
    assert.equal(validateBundle(bundleBueno()), undefined)
})

test('cualquier JSON no es un bundle', () => {
    assert.ok(validateBundle({ hola: 1 }))
    assert.ok(validateBundle(null))
    assert.ok(validateBundle('texto'))
})

test('un formato mas nuevo se rechaza diciendo QUE hay que hacer, no solo que falla', () => {
    // Para esto existe formatVersion desde el primer dia: que un Kwirth viejo pueda decir "no se leer
    // esto" en vez de aplicar medio fichero que no entiende.
    const problema = validateBundle({ ...bundleBueno(), formatVersion: CONFIG_BUNDLE_FORMAT_VERSION + 1 })
    assert.ok(problema?.includes('upgrade Kwirth'))
})

// ─── export ────────────────────────────────────────────────────────────────────

test('el export lleva lo del core y solo las extensiones que pueden responder', async () => {
    const refs = [refConInstancia('si'), refConInstancia('no', false)]
    const manager = new ConfigBundleManager(async () => refs, coreFalso(), '0.6.31')
    const bundle = await manager.export({ includeCredentials: false })

    assert.deepEqual(bundle.core.settings, { metricsInterval: 30 })
    assert.equal(bundle.extensions.length, 1)
    assert.equal(bundle.extensions[0].id, 'si')
})

test('sin credenciales, lo que se pide a la extension es SIN credenciales', async () => {
    const manager = new ConfigBundleManager(async () => [refConInstancia('a')], coreFalso(), '0.6.31')

    const sin = await manager.export({ includeCredentials: false })
    assert.equal((sin.extensions[0].config as { secreto: string }).secreto, '')
    assert.equal(sin.meta.includesCredentials, false, 'el fichero declara que NO las lleva')

    const con = await manager.export({ includeCredentials: true })
    assert.equal((con.extensions[0].config as { secreto: string }).secreto, 'valor-real')
    assert.equal(con.meta.includesCredentials, true, 'y declara que SI, para quien lo guarde')
})

test('el include manda: lo no marcado no viaja', async () => {
    const refs = [refConInstancia('uno'), refConInstancia('dos')]
    const manager = new ConfigBundleManager(async () => refs, coreFalso(), '0.6.31')
    const bundle = await manager.export({ include: ['plugin/uno'], includeCredentials: false })

    assert.equal(bundle.extensions.length, 1)
    assert.equal(bundle.extensions[0].id, 'uno')
    assert.equal(bundle.core.settings, undefined, 'tampoco entra el core si no se marca')
})

test('una extension que revienta al exportar no se lleva por delante el export entero', async () => {
    const rota: IExtensionRef = {
        type: EExtensionType.PLUGIN, id: 'rota', displayName: 'rota',
        instance: { exportConfig: async () => { throw new Error('boom') } }
    }
    const manager = new ConfigBundleManager(async () => [rota, refConInstancia('sana')], coreFalso(), '0.6.31')
    const bundle = await manager.export({ includeCredentials: false })

    assert.equal(bundle.extensions.length, 1)
    assert.equal(bundle.extensions[0].id, 'sana')
})

// ─── preview e import ──────────────────────────────────────────────────────────

test('la vista previa dice la verdad sobre cada entrada', async () => {
    const bundle = bundleBueno([
        { type: EExtensionType.PLUGIN, id: 'instalada', version: '1.0.0', config: {} },
        { type: EExtensionType.PLUGIN, id: 'ausente', version: '1.0.0', config: {} },
        { type: EExtensionType.PLUGIN, id: 'sinmetodo', version: '1.0.0', config: {} }
    ])
    const manager = new ConfigBundleManager(
        async () => [refConInstancia('instalada'), refConInstancia('sinmetodo', true, false)],
        coreFalso(), '0.6.31')

    const previa = await manager.preview(bundle)
    assert.deepEqual(previa.map(p => p.status), [
        EBundleEntryStatus.AVAILABLE,
        EBundleEntryStatus.NOT_INSTALLED,
        EBundleEntryStatus.NOT_SUPPORTED
    ])
})

test('la vista previa NO toca nada', async () => {
    const core = coreFalso()
    const manager = new ConfigBundleManager(async () => [], core, '0.6.31')
    const bundle = { ...bundleBueno(), core: { settings: { metricsInterval: 999 } } }

    await manager.preview(bundle)
    assert.deepEqual(core.settings, { metricsInterval: 30 }, 'previsualizar no es importar')
})

test('el import aplica lo del core y lo de quien puede recibirlo', async () => {
    const core = coreFalso()
    const manager = new ConfigBundleManager(async () => [refConInstancia('a')], core, '0.6.31')
    const bundle: IConfigBundle = {
        ...bundleBueno([{ type: EExtensionType.PLUGIN, id: 'a', config: { algo: 1 } }]),
        core: { settings: { metricsInterval: 60 } }
    }

    const informe = await manager.import({ bundle })
    assert.deepEqual(core.settings, { metricsInterval: 60 })
    assert.deepEqual(informe.coreApplied, [CORE_SETTINGS_KEY])
    assert.deepEqual(informe.entries[0].result, { applied: 1, skipped: 0, warnings: [] })
})

test('lo que no se puede importar se IGNORA con su motivo, y el resto entra', async () => {
    // Es la regla que hace usable el mecanismo mientras casi nadie ha adoptado el contrato: un fichero
    // con diez extensiones y dos instaladas tiene que aplicar esas dos, no fallar entero.
    const bundle = bundleBueno([
        { type: EExtensionType.PLUGIN, id: 'ausente', config: {} },
        { type: EExtensionType.PLUGIN, id: 'buena', config: {} }
    ])
    const manager = new ConfigBundleManager(async () => [refConInstancia('buena')], coreFalso(), '0.6.31')

    const informe = await manager.import({ bundle })
    assert.equal(informe.entries.length, 2)
    assert.equal(informe.entries[0].status, EBundleEntryStatus.NOT_INSTALLED)
    assert.equal(informe.entries[0].result, undefined)
    assert.ok(informe.entries[1].result, 'la que si estaba se aplico')
})

test('una extension que revienta al importar no detiene a las demas', async () => {
    const rota: IExtensionRef = {
        type: EExtensionType.PLUGIN, id: 'rota', displayName: 'rota',
        instance: { importConfig: async () => { throw new Error('no me gusta esto') } }
    }
    const bundle = bundleBueno([
        { type: EExtensionType.PLUGIN, id: 'rota', config: {} },
        { type: EExtensionType.PLUGIN, id: 'buena', config: {} }
    ])
    const manager = new ConfigBundleManager(async () => [rota, refConInstancia('buena')], coreFalso(), '0.6.31')

    const informe = await manager.import({ bundle })
    assert.ok(informe.entries[0].error?.includes('no me gusta esto'))
    assert.ok(informe.entries[1].result, 'la siguiente se importo igual')
})

test('exportar e importar sobre lo mismo no cambia nada', async () => {
    // Idempotencia: es lo que permite reimportar sin miedo, y lo que se le exige a quien implemente
    // el contrato. Aqui se comprueba la parte que le toca al core.
    const core = coreFalso()
    const manager = new ConfigBundleManager(async () => [refConInstancia('a')], core, '0.6.31')

    const antes = JSON.stringify(core.settings)
    const bundle = await manager.export({ includeCredentials: true })
    await manager.import({ bundle })
    assert.equal(JSON.stringify(core.settings), antes)
})
