/*
    What the log writes, and what it keeps quiet about.

    Until this existed, which components were enabled was a constant of the module: 'auth' and 'stor' were
    mute with no way of turning them on, and there was no level filter at all. What is pinned down here is
    the part that is expensive to get wrong, because getting it wrong is SILENT — a line that stops being
    written leaves no trace of having been lost:

      · a level filters what is below it and lets through what is above
      · an id beats its component, which is what 'one channel at trace, the rest at warn' rests on
      · an ERROR is never silenced, not even at 'off'
      · rubbish in the settings is ignored rather than leaving the log in an unknown state

    console.log is captured instead of being mocked away: what matters is whether the line COMES OUT, and
    that is the last thing that happens.
*/

import test from 'node:test'
import assert from 'node:assert/strict'
import { ELogLevel } from '@kwirthmagnify/kwirth-common'
import { applyLogSettings, componentLogger, currentLogSettings, ELogComponent, logComponentCatalog, logInfo, logTrace, logWarning, logError } from '../../src/tools/Logging'

// What came out of console.log/console.error while running the function, one entry per line.
const captured = (fn: () => void): string[] => {
    const lines: string[] = []
    const log = console.log
    const err = console.error
    console.log = (message?: unknown) => { lines.push(String(message)) }
    console.error = (message?: unknown) => { lines.push(String(message)) }
    try { fn() }
    finally {
        console.log = log
        console.error = err
    }
    return lines
}

// Colour off, so what is asserted is the message and not the escape sequences around it.
const withLevels = (levels: Record<string, ELogLevel>): void => applyLogSettings({ levels, ansi: false })

test('con nada configurado escriben los SEIS componentes: auth y stor ya no son mudos', () => {
    applyLogSettings(undefined)
    applyLogSettings({ ansi: false })
    for (const component of Object.values(ELogComponent)) {
        const lines = captured(() => logInfo(component, 'hola'))
        assert.equal(lines.length, 1, `el componente '${component}' no escribio`)
        assert.ok(lines[0].includes(`[${component}]`))
    }
})

test('un nivel filtra lo de debajo y deja pasar lo de encima', () => {
    withLevels({ [ELogComponent.CORE]: ELogLevel.WARN })
    assert.equal(captured(() => logTrace(ELogComponent.CORE, 'x')).length, 0)
    assert.equal(captured(() => logInfo(ELogComponent.CORE, 'x')).length, 0)
    assert.equal(captured(() => logWarning(ELogComponent.CORE, 'x')).length, 1)
})

test("'off' calla al componente entero", () => {
    withLevels({ [ELogComponent.CHANNEL]: ELogLevel.OFF })
    assert.equal(captured(() => logTrace(ELogComponent.CHANNEL, 'x')).length, 0)
    assert.equal(captured(() => logInfo(ELogComponent.CHANNEL, 'x')).length, 0)
    assert.equal(captured(() => logWarning(ELogComponent.CHANNEL, 'x')).length, 0)
})

test('🔴 un ERROR sale siempre, incluso con el componente en off', () => {
    withLevels({ [ELogComponent.CHANNEL]: ELogLevel.OFF })
    const lines = captured(() => logError(ELogComponent.CHANNEL, 'se rompio'))
    assert.equal(lines.length, 1, 'un error se ha silenciado: el filtro esconde fallos')
    assert.ok(lines[0].includes('se rompio'))
})

test('🔴 el nivel de un id gana al de su componente: un canal a trace con el resto callados', () => {
    withLevels({ [ELogComponent.CHANNEL]: ELogLevel.WARN, 'chan:excubitor': ELogLevel.TRACE })
    const excubitor = componentLogger(ELogComponent.CHANNEL, 'excubitor')
    const agora = componentLogger(ELogComponent.CHANNEL, 'agora')

    const suyas = captured(() => excubitor.trace('detalle'))
    assert.equal(suyas.length, 1, 'el canal afinado a trace no escribio')
    assert.ok(suyas[0].includes('[excubitor] detalle'))

    assert.equal(captured(() => agora.trace('detalle')).length, 0, 'otro canal escribio pese a estar en warn')
    assert.equal(captured(() => agora.warning('ojo')).length, 1)
})

test('un id sin nivel propio sigue al de su componente', () => {
    withLevels({ [ELogComponent.PROVIDER]: ELogLevel.ERROR })
    const metrics = componentLogger(ELogComponent.PROVIDER, 'metrics')
    assert.equal(captured(() => metrics.info('x')).length, 0)
    assert.equal(captured(() => metrics.error('x')).length, 1)
})

test('el id de un componente NO afecta al mismo id de otro componente', () => {
    // 'sugarless' is both a channel and a provider: turning one up must not turn the other up.
    withLevels({ [ELogComponent.CHANNEL]: ELogLevel.WARN, [ELogComponent.PROVIDER]: ELogLevel.WARN, 'chan:sugarless': ELogLevel.TRACE })
    assert.equal(captured(() => componentLogger(ELogComponent.CHANNEL, 'sugarless').trace('x')).length, 1)
    assert.equal(captured(() => componentLogger(ELogComponent.PROVIDER, 'sugarless').trace('x')).length, 0)
})

test('lo que no se reconoce se ignora y no deja el log en un estado raro', () => {
    // The settings are a JSON file that can be edited by hand: an odd entry must not silence anything.
    applyLogSettings({ levels: { 'noexiste': ELogLevel.OFF, [ELogComponent.CORE]: 'gritando' as ELogLevel }, ansi: false })
    assert.equal(captured(() => logInfo(ELogComponent.CORE, 'x')).length, 1, 'un nivel invalido ha cambiado el del core')
})

test('applyLogSettings parte SIEMPRE de los defaults, no acumula lo anterior', () => {
    withLevels({ [ELogComponent.SENDER]: ELogLevel.OFF })
    assert.equal(captured(() => logInfo(ELogComponent.SENDER, 'x')).length, 0)
    // Applying a settings object that does not name it has to give it its default back, not leave it off.
    withLevels({ [ELogComponent.CORE]: ELogLevel.INFO })
    assert.equal(captured(() => logInfo(ELogComponent.SENDER, 'x')).length, 1, 'el nivel anterior ha sobrevivido a un apply que no lo nombraba')
})

test('currentLogSettings devuelve lo que RIGE, que es lo que el dialogo tiene que enseñar', () => {
    withLevels({ [ELogComponent.AUTH]: ELogLevel.TRACE })
    const vigente = currentLogSettings()
    assert.equal(vigente.ansi, false)
    assert.equal(vigente.levels?.[ELogComponent.AUTH], ELogLevel.TRACE)
    // Every component comes out, not just the one that was touched: with nothing configured the dialog
    // would otherwise open blank while the core writes under its defaults.
    assert.equal(Object.keys(vigente.levels ?? {}).length, Object.values(ELogComponent).length)
})

test('ansi:false deja la linea sin secuencias de escape', () => {
    withLevels({})
    const [line] = captured(() => logInfo(ELogComponent.CORE, 'limpio'))
    assert.ok(!line.includes('\x1b['), 'la linea lleva codigos ANSI con el color desactivado')
})

test('el catalogo ofrece los ids que han escrito, para poder afinarlos', () => {
    componentLogger(ELogComponent.PROVIDER, 'longhorn')
    const providers = logComponentCatalog().find(c => c.id === ELogComponent.PROVIDER)
    assert.ok(providers?.ids?.includes('longhorn'), 'un id con logger no aparece en el catalogo')
    // And every component is published, with a label a person can read.
    assert.equal(logComponentCatalog().length, Object.values(ELogComponent).length)
    assert.ok(logComponentCatalog().every(c => c.label.length > 0 && c.description.length > 0))
})
