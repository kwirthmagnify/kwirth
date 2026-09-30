import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CoreV1Api } from '@kubernetes/client-node'
import { buildPreviousContainerMessage, getPreviousContainerLog, IPreviousContainerLog, logPreviousContainerBanner, readPreviousContainerLog, resolvePreviousLogLines } from '../../src/tools/PreviousContainerLog'

/*
    When the core dies inside the cluster, what explains the death stays in the previous container and
    only the kubelet has it, for as long as it has it. This is read once, at startup.

    The two invariants these tests pin down:

      · reading it can NEVER spoil the startup — which is why nothing here throws, not even when the
        Kubernetes API fails;
      · "there was no restart" and "there was a restart but the log is gone" are DIFFERENT states. Mixing
        them up is what makes whoever is looking believe Kwirth has eaten the log.
*/

interface IFakeCallOptions {
    name?: string
    namespace?: string
    container?: string
    previous?: boolean
    tailLines?: number
}

interface IFakeApi {
    api: CoreV1Api
    logCalls: IFakeCallOptions[]
}

const NS = 'kwirth'
const POD = 'kwirth-7c9f8d5b6-xk2p9'

// A containerStatus with just what the code looks at
const status = (name: string, restartCount: number, terminated?: Record<string, unknown>) => ({
    name,
    restartCount,
    lastState: terminated ? { terminated } : {},
})

const fakeApi = (options: { statuses?: any[], log?: string, logThrows?: string, podThrows?: string }): IFakeApi => {
    const logCalls: IFakeCallOptions[] = []
    const api = {
        readNamespacedPod: async () => {
            if (options.podThrows) throw new Error(options.podThrows)
            return { status: { containerStatuses: options.statuses ?? [] } }
        },
        readNamespacedPodLog: async (opts: IFakeCallOptions) => {
            logCalls.push(opts)
            if (options.logThrows) throw new Error(options.logThrows)
            return options.log ?? ''
        },
    } as unknown as CoreV1Api
    return { api, logCalls }
}

test('un contenedor que no ha reiniciado no tiene log anterior, y no se pide', async () => {
    const { api, logCalls } = fakeApi({ statuses: [status('kwirth', 0)] })

    const result = await readPreviousContainerLog(api, NS, POD)

    assert.equal(result.restarted, false)
    assert.equal(result.abnormal, false)
    assert.deepEqual(result.lines, [])
    assert.equal(logCalls.length, 0, 'no hay que preguntar por un log que no existe')
})

test('tras un crash se lee el log del contenedor anterior, con previous y el numero de lineas pedido', async () => {
    const { api, logCalls } = fakeApi({
        statuses: [status('kwirth', 3, { exitCode: 1, reason: 'Error', startedAt: new Date('2026-09-20T13:00:00Z'), finishedAt: new Date('2026-09-20T13:47:42Z') })],
        log: 'primera\nsegunda\ntercera\n',
    })

    const result = await readPreviousContainerLog(api, NS, POD)

    assert.equal(result.restarted, true)
    assert.equal(result.abnormal, true)
    assert.equal(result.restartCount, 3)
    assert.equal(result.container, 'kwirth')
    assert.equal(result.termination?.exitCode, 1)
    assert.equal(result.termination?.reason, 'Error')
    // the timestamps arrive as Dates from the k8s client and have to come out serialisable
    assert.equal(result.termination?.finishedAt, '2026-09-20T13:47:42.000Z')
    // the empty line left by the trailing \n is not a log line
    assert.deepEqual(result.lines, ['primera', 'segunda', 'tercera'])

    assert.equal(logCalls.length, 1)
    assert.equal(logCalls[0].previous, true, 'sin previous se estaria leyendo el contenedor VIVO')
    assert.equal(logCalls[0].container, 'kwirth')
    assert.equal(logCalls[0].namespace, NS)
    assert.equal(logCalls[0].tailLines, 1000)
})

test('una parada limpia (exit 0) se distingue de un crash, aunque haya reiniciado', async () => {
    const { api } = fakeApi({ statuses: [status('kwirth', 1, { exitCode: 0, reason: 'Completed' })], log: 'bye\n' })

    const result = await readPreviousContainerLog(api, NS, POD)

    assert.equal(result.restarted, true)
    assert.equal(result.abnormal, false, 'exit 0 es un SIGTERM atendido, no hay que avisar de nada')
})

test('OOMKilled cuenta como salida anomala', async () => {
    const { api } = fakeApi({ statuses: [status('kwirth', 1, { exitCode: 137, reason: 'OOMKilled' })], log: '' })

    const result = await readPreviousContainerLog(api, NS, POD)

    assert.equal(result.abnormal, true)
    assert.equal(result.termination?.reason, 'OOMKilled')
})

test('si el log ya no esta, el reinicio se reporta igual y se explica por que no hay lineas', async () => {
    const { api } = fakeApi({
        statuses: [status('kwirth', 2, { exitCode: 1, reason: 'Error' })],
        logThrows: 'previous terminated container "kwirth" in pod not found',
    })

    const result = await readPreviousContainerLog(api, NS, POD)

    // the restart is a FACT: the pod's state says so, not the log
    assert.equal(result.restarted, true)
    assert.equal(result.abnormal, true)
    assert.deepEqual(result.lines, [])
    assert.match(result.unavailableReason ?? '', /not found/)
})

test('si la API de Kubernetes falla, no se lanza: esto es diagnostico, no arranque', async () => {
    const { api, logCalls } = fakeApi({ podThrows: 'connect ECONNREFUSED 10.43.0.1:443' })

    const result = await readPreviousContainerLog(api, NS, POD)

    assert.equal(result.restarted, false)
    assert.deepEqual(result.lines, [])
    assert.match(result.unavailableReason ?? '', /ECONNREFUSED/)
    assert.equal(logCalls.length, 0)
})

test('con sidecars se elige el contenedor que reinicio, no el primero', async () => {
    const { api, logCalls } = fakeApi({
        statuses: [status('istio-proxy', 0), status('kwirth', 1, { exitCode: 1 })],
        log: 'la traza\n',
    })

    const result = await readPreviousContainerLog(api, NS, POD)

    assert.equal(result.container, 'kwirth')
    assert.equal(logCalls[0].container, 'kwirth')
})

test('un reinicio sin lastState.terminated no se toma por log anterior', async () => {
    // it can happen while the kubelet is rebuilding the pod's state
    const { api, logCalls } = fakeApi({ statuses: [status('kwirth', 1)] })

    const result = await readPreviousContainerLog(api, NS, POD)

    assert.equal(result.restarted, false)
    assert.equal(logCalls.length, 0)
})

test('lo leido queda disponible para el endpoint del About', async () => {
    const { api } = fakeApi({ statuses: [status('kwirth', 1, { exitCode: 1 })], log: 'una linea' })

    await readPreviousContainerLog(api, NS, POD)

    assert.deepEqual(getPreviousContainerLog().lines, ['una linea'])
    assert.equal(getPreviousContainerLog().abnormal, true)
})

test('el numero de lineas es 1000 por defecto y se puede subir por entorno', () => {
    delete process.env.PREVIOUSLOGLINES
    assert.equal(resolvePreviousLogLines(), 1000)

    process.env.PREVIOUSLOGLINES = '5000'
    assert.equal(resolvePreviousLogLines(), 5000)

    // garbage and absurd values do not leave the core without a log: it falls back to the default
    process.env.PREVIOUSLOGLINES = 'muchas'
    assert.equal(resolvePreviousLogLines(), 1000)
    process.env.PREVIOUSLOGLINES = '0'
    assert.equal(resolvePreviousLogLines(), 1000)
    process.env.PREVIOUSLOGLINES = '-10'
    assert.equal(resolvePreviousLogLines(), 1000)

    delete process.env.PREVIOUSLOGLINES
})

test('las lineas se piden con lo que decida la configuracion de Kwirth, no con el default', async () => {
    const { api, logCalls } = fakeApi({
        statuses: [status('kwirth', 1, { exitCode: 1, reason: 'Error' })],
        log: 'una linea\n',
    })

    // the caller resolves the value (settings → environment → default) and passes it already resolved
    await readPreviousContainerLog(api, NS, POD, 250)

    assert.equal(logCalls[0].tailLines, 250)
})

test('un valor invalido cae al del entorno/default en vez de pedir cero lineas', async () => {
    delete process.env.PREVIOUSLOGLINES
    const { api, logCalls } = fakeApi({ statuses: [status('kwirth', 1, { exitCode: 1 })], log: 'x\n' })

    await readPreviousContainerLog(api, NS, POD, 0)

    assert.equal(logCalls[0].tailLines, 1000, 'tailLines 0 dejaria el diagnostico vacio')
})

/*
    What the restart PRODUCES, which is the half nobody sees until it matters: the banner in the core
    log and the message that goes out to a sender. Reading the log is useless if the only way to learn
    about it is to open a dialog nobody opens when things are going well.
*/

const restartedLog = (over: Partial<IPreviousContainerLog> = {}): IPreviousContainerLog => ({
    restarted: true,
    abnormal: true,
    restartCount: 3,
    container: 'kwirth',
    termination: { exitCode: 137, reason: 'OOMKilled', finishedAt: '2026-09-30T02:11:00.000Z' },
    lines: Array.from({ length: 500 }, (_, i) => `line ${i + 1}`),
    ...over,
})

// The banner goes to console.error, so that is what has to be captured to read it back
const captureErrors = async (fn: () => void): Promise<string[]> => {
    const captured: string[] = []
    const original = console.error
    console.error = (...args: unknown[]) => { captured.push(args.map(String).join(' ')) }
    try { fn() } finally { console.error = original }
    return captured
}

test('the banner frames the restart between two rows of asterisks', async () => {
    const output = await captureErrors(() => logPreviousContainerBanner(restartedLog()))

    assert.ok(output.length >= 4, 'the banner is several lines, one call each')
    assert.match(output[0], /\*{80}/, 'it opens with a rule')
    assert.match(output[output.length - 1], /\*{80}/, 'and closes with another')
    assert.ok(output.some(l => l.includes('KWIRTH RESTARTED')), 'it says what happened')
    assert.ok(output.some(l => l.includes('exit code 137 (OOMKilled)')), 'and why')
    assert.ok(output.some(l => l.includes('restarts: 3')), 'and how many times')
})

test('every banner line is a call of its own, so none comes out without its prefix', async () => {
    const output = await captureErrors(() => logPreviousContainerBanner(restartedLog()))

    for (const line of output) {
        assert.ok(!line.includes('\n'), `a line with \n would print unprefixed and ungreppable: ${line}`)
    }
})

test('the banner goes out at ERROR, which no level filter can silence', async () => {
    // console.log is left in place: if the banner went out as info or warning, nothing would be captured
    const output = await captureErrors(() => logPreviousContainerBanner(restartedLog()))

    assert.ok(output.length > 0, 'a warning can be filtered out by lowering the core component')
    assert.ok(output.every(l => l.includes('[ERRO]')), 'and only the error level is never filtered')
})

test('with no restart there is no banner at all', async () => {
    const output = await captureErrors(() => logPreviousContainerBanner({ restarted: false, abnormal: false, restartCount: 0, lines: [] }))

    assert.equal(output.length, 0, 'a normal startup must not shout')
})

test('the banner says the log is gone instead of claiming zero lines', async () => {
    const output = await captureErrors(() => logPreviousContainerBanner(restartedLog({ lines: [], unavailableReason: 'log rotated' })))

    assert.ok(output.some(l => l.includes('could NOT be read') && l.includes('log rotated')))
    assert.ok(!output.some(l => l.includes('0 lines recovered')), '"0 lines" reads as "it wrote nothing", which is a different thing')
})

test('the message carries only the LAST lines, up to the cap', async () => {
    const message = buildPreviousContainerMessage(restartedLog(), 200, NS, POD)

    assert.equal(message.metadata?.linesSent, 200)
    assert.equal(message.metadata?.linesRecovered, 500)
    assert.ok(message.body.includes('line 500'), 'the tail is what explains the death')
    assert.ok(message.body.includes('line 301'), 'the last 200 start here')
    assert.ok(!message.body.includes('line 300\n'), 'and nothing older travels')
})

test('an abnormal exit travels as error and a clean one as warning', () => {
    assert.equal(buildPreviousContainerMessage(restartedLog(), 10).level, 'error')
    assert.equal(buildPreviousContainerMessage(restartedLog({ abnormal: false, termination: { exitCode: 0 } }), 10).level, 'warning')
})

test('the subject says the cause, so it is readable without opening the message', () => {
    const message = buildPreviousContainerMessage(restartedLog(), 10)

    assert.equal(message.subject, 'Kwirth restarted — exit code 137 (OOMKilled)')
    assert.equal(message.origin?.namespace, undefined, 'not passed in this call')
    assert.equal(message.origin?.source, 'core', 'the core is what is speaking, not a provider')
})

test('the origin travels when it is known, so the destination can label it', () => {
    const message = buildPreviousContainerMessage(restartedLog(), 10, NS, POD)

    assert.equal(message.origin?.namespace, NS)
    assert.equal(message.origin?.pod, POD)
    assert.equal(message.origin?.container, 'kwirth')
})

test('with no lines the message is still worth sending: the cause is the news', () => {
    const message = buildPreviousContainerMessage(restartedLog({ lines: [], unavailableReason: 'log rotated' }), 200)

    assert.equal(message.metadata?.linesSent, 0)
    assert.ok(message.body.includes('could not be read'))
    assert.ok(message.body.includes('exit code 137'), 'the termination is known even when the log is not')
})
