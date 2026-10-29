import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EExtensionType, EBundleEntryStatus, IConfigBundle, CONFIG_BUNDLE_KIND, CONFIG_BUNDLE_FORMAT_VERSION, CORE_SETTINGS_KEY, IExtensionImportResult } from '@kwirthmagnify/kwirth-common'
import { ConfigBundleManager, exportStatusOf, importStatusOf, normalizeEntry, validateBundle, IExtensionRef, ICorePortableConfig } from '../../src/tools/ConfigBundleManager'

/*
    Configuration portability. What is pinned down here is the DIVISION OF LABOUR: the core carries and
    does not interpret.

    That is why hardly any test looks at a configuration's content —there is nothing to look at, it is
    opaque— but at WHAT HAPPENS when the recipient is not there, does not implement the contract or blows
    up. That is where a slip produces the worst possible result: a file that looks complete and is not, or
    an import that stops halfway without saying so.
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

/*
    What the core keeps ABOUT an extension (`CoreManagedConfig` manufactures it in the real thing). It is
    the part that is there whether the extension is running or not, and the one that used to be lost.
*/
const interlocutorDelCore = (): IExtensionRef['coreInstance'] => ({
    exportConfig: async () => ({ installConfig: { algo: 'del core' } }),
    importConfig: async (): Promise<IExtensionImportResult> => ({ applied: 1, skipped: 0, warnings: ['aviso del core'] })
})

/** An installed plugin WITH its installation configuration and WITHOUT a live channel. */
const refSinInstancia = (id: string, version = '1.0.0'): IExtensionRef => ({
    type: EExtensionType.PLUGIN,
    id,
    displayName: id,
    version,
    coreInstance: interlocutorDelCore(),
    instantiable: true
})

/** And the complete one: the core's part and the extension's own. */
const refCompleta = (id: string): IExtensionRef => ({ ...refConInstancia(id), coreInstance: interlocutorDelCore(), instantiable: true })

const coreFalso = (): ICorePortableConfig & { settings: unknown, sharedAi: unknown } => {
    const estado = {
        settings: { metricsInterval: 30 } as unknown,
        sharedAi: { llms: ['uno'] } as unknown,
        readSettings: async (_cred: boolean) => estado.settings,
        writeSettings: async (d: unknown) => { estado.settings = d },
        readSharedAi: async (cred: boolean) => cred ? estado.sharedAi : { llms: ['uno'], apiKey: '' },
        writeSharedAi: async (d: unknown) => { estado.sharedAi = d }
    }
    return estado
}

// ─── an entry's state ──────────────────────────────────────────────────────────

test('una extension con instancia y metodo se puede exportar', () => {
    assert.equal(exportStatusOf(refConInstancia('a')), EBundleEntryStatus.AVAILABLE)
})

test('con instancia pero sin metodo: no soporta el contrato, que es OPCIONAL', () => {
    assert.equal(exportStatusOf(refConInstancia('a', false)), EBundleEntryStatus.NOT_SUPPORTED)
})

test('sin instancia no hay a quien preguntar, y eso NO es lo mismo que no soportarlo', () => {
    // A channel that is not required, or announced as REMOTE, is installed but not instantiated. They are
    // two different messages for the user: one is fixed by using the plugin, the other by waiting for its author.
    const ref: IExtensionRef = { type: EExtensionType.PLUGIN, id: 'a', displayName: 'a' }
    assert.equal(exportStatusOf(ref), EBundleEntryStatus.NOT_INSTANTIATED)
})

test('instalada, con config del core y SIN instancia viva: parcial, que no es lo mismo que disponible', () => {
    // The case that used to come out green: the entry travelled, the dialog said AVAILABLE, and inside
    // went only the installation configuration. A file that looks complete and is not.
    assert.equal(exportStatusOf(refSinInstancia('excubitor')), EBundleEntryStatus.PARTIAL)
})

test('con las dos partes, disponible entera', () => {
    assert.equal(exportStatusOf(refCompleta('vllm')), EBundleEntryStatus.AVAILABLE)
})

test('quien no puede tener instancia propia NO sale parcial: no le falta nada', () => {
    // An IdP connector or a toolset: their configuration is the core's by design, and showing them in
    // amber for ever would teach the user to ignore the warning that does matter.
    const toolset: IExtensionRef = {
        type: EExtensionType.AITOOLSET, id: 'suse-fleet', displayName: 'suse-fleet',
        coreInstance: interlocutorDelCore()
    }
    assert.equal(exportStatusOf(toolset), EBundleEntryStatus.AVAILABLE)
})

test('con instancia viva que no exporta, pero con parte del core, se exporta lo que hay', () => {
    const ref: IExtensionRef = { ...refConInstancia('montag', false, false), coreInstance: interlocutorDelCore(), instantiable: true }
    assert.equal(exportStatusOf(ref), EBundleEntryStatus.AVAILABLE)
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

// ─── validating the wrapper ────────────────────────────────────────────────────

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
    // This is what formatVersion has existed for since day one: so an old Kwirth can say "I cannot read
    // this" instead of applying half a file it does not understand.
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

test('readSettings recibe includeCredentials, para que el core sepa si sacar los secrets', async () => {
    let recibioCred = undefined as boolean | undefined
    const core = coreFalso()
    core.readSettings = async (cred: boolean) => { recibioCred = cred; return core.settings }
    const manager = new ConfigBundleManager(async () => [], core, '0.6.31')

    await manager.export({ includeCredentials: false })
    assert.equal(recibioCred, false)

    await manager.export({ includeCredentials: true })
    assert.equal(recibioCred, true)
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
    // It is the rule that makes the mechanism usable while almost nobody has adopted the contract: a file
    // with ten extensions and two installed has to apply those two, not fail entirely.
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

// ─── the two parts: each in its own field ──────────────────────────────────────

test('el export escribe cada fuente en SU campo, sin mezclarlas', async () => {
    const manager = new ConfigBundleManager(async () => [refCompleta('vllm')], coreFalso(), '0.6.31')
    const bundle = await manager.export({ includeCredentials: false })

    assert.deepEqual(bundle.extensions[0].coreConfig, { installConfig: { algo: 'del core' } })
    assert.deepEqual(bundle.extensions[0].config, { id: 'vllm', secreto: '' })
})

test('sin instancia viva viaja la parte del core, y el campo propio queda sin poner', async () => {
    // Not an empty object: `undefined` is what says "nobody was asked", and an empty one at the
    // destination reads as a configuration that was deliberately blanked.
    const manager = new ConfigBundleManager(async () => [refSinInstancia('excubitor')], coreFalso(), '0.6.31')
    const bundle = await manager.export({ includeCredentials: false })

    assert.equal(bundle.extensions.length, 1, 'la entrada viaja igual: perderla seria perder tambien lo del core')
    assert.deepEqual(bundle.extensions[0].coreConfig, { installConfig: { algo: 'del core' } })
    assert.equal(bundle.extensions[0].config, undefined)
})

test('si la parte propia revienta, la del core sale igual', async () => {
    const ref: IExtensionRef = {
        type: EExtensionType.PLUGIN, id: 'rota', displayName: 'rota',
        coreInstance: interlocutorDelCore(), instantiable: true,
        instance: { exportConfig: async () => { throw new Error('boom') } }
    }
    const manager = new ConfigBundleManager(async () => [ref], coreFalso(), '0.6.31')
    const bundle = await manager.export({ includeCredentials: false })

    assert.equal(bundle.extensions.length, 1)
    assert.deepEqual(bundle.extensions[0].coreConfig, { installConfig: { algo: 'del core' } })
    assert.equal(bundle.extensions[0].config, undefined)
})

test('al importar se suman los dos resultados, avisos incluidos', async () => {
    const manager = new ConfigBundleManager(async () => [refCompleta('a')], coreFalso(), '0.6.31')
    const bundle = bundleBueno([{ type: EExtensionType.PLUGIN, id: 'a', coreConfig: { x: 1 }, config: { y: 2 } }])

    const informe = await manager.import({ bundle })
    assert.equal(informe.entries[0].result?.applied, 2, 'una de cada parte')
    assert.deepEqual(informe.entries[0].result?.warnings, ['aviso del core'])
})

test('si una parte falla al importar, la otra se aplica y el fallo se dice', async () => {
    const ref: IExtensionRef = {
        type: EExtensionType.PLUGIN, id: 'a', displayName: 'a', instantiable: true,
        coreInstance: interlocutorDelCore(),
        instance: { importConfig: async () => { throw new Error('no me gusta esto') } }
    }
    const manager = new ConfigBundleManager(async () => [ref], coreFalso(), '0.6.31')
    const bundle = bundleBueno([{ type: EExtensionType.PLUGIN, id: 'a', coreConfig: { x: 1 }, config: { y: 2 } }])

    const informe = await manager.import({ bundle })
    assert.equal(informe.entries[0].result?.applied, 1, 'lo del core entro')
    assert.ok(informe.entries[0].error?.includes('no me gusta esto'))
})

test('si el fichero trae parte propia y no hay quien la reciba, se avisa en el informe', async () => {
    const manager = new ConfigBundleManager(async () => [refSinInstancia('excubitor')], coreFalso(), '0.6.31')
    const bundle = bundleBueno([{ type: EExtensionType.PLUGIN, id: 'excubitor', coreConfig: { x: 1 }, config: { ocho: 'areas' } }])

    const informe = await manager.import({ bundle })
    assert.equal(informe.entries[0].status, EBundleEntryStatus.PARTIAL)
    assert.equal(informe.entries[0].result?.applied, 1)
    assert.ok(informe.entries[0].result?.warnings.some(w => w.includes('no live instance')))
})

// ─── reading format 1 ──────────────────────────────────────────────────────────

test('un bundle de formato 1 SIN envoltorio es la parte del core, nunca la de la extension', () => {
    // The bug this format version exists for: read as the extension's own, the installation
    // configuration of every entry exported before the extensions adopted the contract was lost without
    // a word, and a plugin was handed a configuration that was never its.
    const partes = normalizeEntry({ type: EExtensionType.PLUGIN, id: 'a', config: { installConfig: { x: 1 } } }, 1)
    assert.deepEqual(partes.coreConfig, { installConfig: { x: 1 } })
    assert.equal(partes.config, undefined)
})

test('un bundle de formato 1 CON envoltorio se reparte en las dos partes', () => {
    const partes = normalizeEntry({ type: EExtensionType.PLUGIN, id: 'a', config: { core: { x: 1 }, own: { y: 2 } } }, 1)
    assert.deepEqual(partes.coreConfig, { x: 1 })
    assert.deepEqual(partes.config, { y: 2 })
})

test('en formato 2 manda la VERSION y no la forma del contenido', () => {
    // A format 2 entry whose only part is the extension's own looks exactly like a bare format 1 one.
    // Guessing by shape would swap the two parts round in silence.
    const entry = { type: EExtensionType.PLUGIN, id: 'a', config: { models: [] } }
    assert.deepEqual(normalizeEntry(entry, 2), { coreConfig: undefined, config: { models: [] } })
    assert.deepEqual(normalizeEntry(entry, 1), { coreConfig: { models: [] }, config: undefined })
})

test('un formato 1 entra por la puerta del import y aplica lo del core', async () => {
    const manager = new ConfigBundleManager(async () => [refCompleta('a')], coreFalso(), '0.6.31')
    const viejo: IConfigBundle = {
        ...bundleBueno([{ type: EExtensionType.PLUGIN, id: 'a', config: { installConfig: { x: 1 } } }]),
        formatVersion: 1
    }

    const informe = await manager.import({ bundle: viejo })
    assert.equal(informe.entries[0].result?.applied, 1)
    assert.deepEqual(informe.entries[0].result?.warnings, ['aviso del core'], 'lo aplico el core, no la extension')
})

test('exportar e importar sobre lo mismo no cambia nada', async () => {
    // Idempotence: it is what makes re-importing fearless, and what is demanded of whoever implements the
    // contract. What is checked here is the part that falls to the core.
    const core = coreFalso()
    const manager = new ConfigBundleManager(async () => [refConInstancia('a')], core, '0.6.31')

    const antes = JSON.stringify(core.settings)
    const bundle = await manager.export({ includeCredentials: true })
    await manager.import({ bundle })
    assert.equal(JSON.stringify(core.settings), antes)
})
