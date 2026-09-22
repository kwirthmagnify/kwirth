import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CoreV1Api } from '@kubernetes/client-node'
import { getPreviousContainerLog, readPreviousContainerLog, resolvePreviousLogLines } from '../../src/tools/PreviousContainerLog'

/*
    Cuando el core muere dentro del cluster, lo que explica la muerte se queda en el contenedor anterior y
    solo el kubelet lo tiene, mientras lo tenga. Esto se lee una vez, al arrancar.

    Los dos invariantes que fijan estos tests:

      · leerlo NUNCA puede estropear el arranque — por eso nada de aqui lanza, ni cuando la API de
        Kubernetes falla;
      · "no hubo reinicio" y "hubo reinicio pero el log ya no esta" son estados DISTINTOS. Confundirlos es
        lo que hace que quien mira crea que Kwirth se ha comido el log.
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

// Un containerStatus con lo justo que mira el codigo
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
    // las marcas de tiempo llegan como Date del cliente de k8s y tienen que salir serializables
    assert.equal(result.termination?.finishedAt, '2026-09-20T13:47:42.000Z')
    // la linea vacia que deja el \n final no es una linea de log
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

    // el reinicio es un HECHO: lo dice el estado del pod, no el log
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
    // puede pasar mientras el kubelet esta rehaciendo el estado del pod
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

    // basura y valores absurdos no dejan el core sin log: se cae al default
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

    // quien llama resuelve el valor (settings → entorno → default) y lo pasa ya resuelto
    await readPreviousContainerLog(api, NS, POD, 250)

    assert.equal(logCalls[0].tailLines, 250)
})

test('un valor invalido cae al del entorno/default en vez de pedir cero lineas', async () => {
    delete process.env.PREVIOUSLOGLINES
    const { api, logCalls } = fakeApi({ statuses: [status('kwirth', 1, { exitCode: 1 })], log: 'x\n' })

    await readPreviousContainerLog(api, NS, POD, 0)

    assert.equal(logCalls[0].tailLines, 1000, 'tailLines 0 dejaria el diagnostico vacio')
})
