import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SenderManager } from '../../src/tools/SenderManager'
import { IConfigMaps } from '../../src/tools/IConfigMap'
import { ISender, ISenderMessage } from '@kwirthmagnify/kwirth-common-back'

/*
    Entrega por LOTES.

    `send` es un mensaje por llamada con su propio await, y eso sirve para un aviso —"se ha caido un
    pod"— pero no para un caudal de log: un await por linea convierte el reenvio en una fila de idas y
    venidas a la red, y las APIs de los destinos (Datadog, Elastic, Loki) aceptan arrays y cobran por
    peticion.

    Lo que fijan estos tests es el contrato que hace que eso sea posible SIN romper a nadie:

      · quien implementa `sendBatch` recibe el lote entero en UNA llamada;
      · quien NO lo implementa sigue recibiendo mensajes de uno en uno, en orden;
      · y un fallo no se lleva por delante lo que queda ni sube al llamante como excepcion — el reenvio
        de log no puede tumbar al que lo produce.
*/

const memConfigMaps = (): IConfigMaps => ({
    read: (async (_name: string, def?: unknown) => def) as IConfigMaps['read'],
    write: (async () => {}) as IConfigMaps['write'],
    writeKey: async () => {},
    readAllKeys: async () => ({})
})

interface IFakeSenderOptions {
    // implementa sendBatch (el caso bueno) o solo send (el caso de compatibilidad)
    batch?: boolean
    // el nombre de config que dice tener
    config?: string
    throwOnBatch?: boolean
    // falla al enviar este cuerpo concreto, para probar que no corta el resto
    throwOnBody?: string
}

interface IFakeSender {
    sender: ISender
    batches: ISenderMessage[][]
    singles: ISenderMessage[]
}

const fakeSender = (id: string, options: IFakeSenderOptions = {}): IFakeSender => {
    const batches: ISenderMessage[][] = []
    const singles: ISenderMessage[] = []
    const configName = options.config ?? 'default'
    const sender: Record<string, unknown> = {
        id,
        addConfig: () => {},
        removeConfig: () => {},
        hasConfig: (name: string) => name === configName,
        getConfigNames: () => [configName],
        startSender: async () => {},
        stopSender: async () => {},
        send: async (_c: string, message: ISenderMessage) => {
            if (options.throwOnBody !== undefined && message.body === options.throwOnBody) throw new Error('boom single')
            singles.push(message)
        }
    }
    if (options.batch) {
        sender.sendBatch = async (_c: string, messages: ISenderMessage[]) => {
            if (options.throwOnBatch) throw new Error('boom batch')
            batches.push(messages)
        }
    }
    return { sender: sender as unknown as ISender, batches, singles }
}

const withSender = async (fake: IFakeSender): Promise<SenderManager> => {
    const manager = new SenderManager(memConfigMaps())
    await manager.init()
    // se inyecta en el registro de instancias, que es de donde sale getSender()
    ;(manager as unknown as { instances: Map<string, ISender> }).instances.set(fake.sender.id, fake.sender)
    return manager
}

const linea = (body: string): ISenderMessage => ({ body })

test('quien implementa sendBatch recibe el lote ENTERO en una sola llamada', async () => {
    const fake = fakeSender('datadog', { batch: true })
    const manager = await withSender(fake)

    await manager.sendBatch('datadog', 'default', [linea('a'), linea('b'), linea('c')])

    assert.equal(fake.batches.length, 1, 'una llamada, no tres')
    assert.deepEqual(fake.batches[0].map(m => m.body), ['a', 'b', 'c'])
    assert.equal(fake.singles.length, 0, 'y no se usa el camino de uno en uno')
})

test('quien NO lo implementa sigue recibiendo mensajes de uno en uno, en orden', async () => {
    const fake = fakeSender('console', { batch: false })
    const manager = await withSender(fake)

    await manager.sendBatch('console', 'default', [linea('a'), linea('b')])

    assert.deepEqual(fake.singles.map(m => m.body), ['a', 'b'], 'el orden es parte del contrato de un log')
})

test('un lote vacio no llama a nada', async () => {
    const fake = fakeSender('datadog', { batch: true })
    const manager = await withSender(fake)

    await manager.sendBatch('datadog', 'default', [])

    assert.equal(fake.batches.length, 0)
    assert.equal(fake.singles.length, 0)
})

test('el origen de cada linea llega intacto al sender: sin el, el destino no puede etiquetar', async () => {
    const fake = fakeSender('datadog', { batch: true })
    const manager = await withSender(fake)

    await manager.sendBatch('datadog', 'default', [{
        body: 'connection refused',
        origin: { cluster: 'k3d', namespace: 'ns-a', pod: 'pod-a', container: 'c1', source: 'fluentbit' }
    }])

    assert.deepEqual(fake.batches[0][0].origin, {
        cluster: 'k3d', namespace: 'ns-a', pod: 'pod-a', container: 'c1', source: 'fluentbit'
    })
})

test('si el sender revienta con el lote, no sube al llamante', async () => {
    const fake = fakeSender('datadog', { batch: true, throwOnBatch: true })
    const manager = await withSender(fake)

    // el reenvio de log no puede tumbar a quien lo produce
    await assert.doesNotReject(() => manager.sendBatch('datadog', 'default', [linea('a')]))
})

test('en el camino de uno en uno, una linea que falla no cancela las siguientes', async () => {
    const fake = fakeSender('console', { batch: false, throwOnBody: 'b' })
    const manager = await withSender(fake)

    await manager.sendBatch('console', 'default', [linea('a'), linea('b'), linea('c')])

    assert.deepEqual(fake.singles.map(m => m.body), ['a', 'c'], 'se entrega lo que se puede')
})

test('un sender que no existe descarta el lote sin lanzar', async () => {
    const manager = new SenderManager(memConfigMaps())
    await manager.init()

    await assert.doesNotReject(() => manager.sendBatch('no-existe', 'default', [linea('a')]))
})

test('una config que el sender no tiene descarta el lote sin lanzar', async () => {
    const fake = fakeSender('datadog', { batch: true, config: 'prod' })
    const manager = await withSender(fake)

    await manager.sendBatch('datadog', 'la-que-no-es', [linea('a')])

    assert.equal(fake.batches.length, 0)
})
