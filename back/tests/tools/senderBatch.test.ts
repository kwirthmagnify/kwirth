import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SenderManager } from '../../src/tools/SenderManager'
import { IConfigMaps } from '../../src/tools/IConfigMap'
import { ISender, ISenderMessage } from '@kwirthmagnify/kwirth-common-back'

/*
    BATCH delivery.

    `send` is one message per call with its own await, and that works for an alert —"a pod has gone
    down"— but not for a stream of log: one await per line turns the forwarding into a queue of round
    trips to the network, and the destinations' APIs (Datadog, Elastic, Loki) accept arrays and charge
    per request.

    What these tests pin down is the contract that makes that possible WITHOUT breaking anybody:

      · whoever implements `sendBatch` receives the whole batch in ONE call;
      · whoever does NOT implement it goes on receiving messages one by one, in order;
      · and a failure neither takes the remainder down with it nor rises to the caller as an exception —
        forwarding log cannot bring down whoever produces it.
*/

const memConfigMaps = (): IConfigMaps => ({
    read: (async (_name: string, def?: unknown) => def) as IConfigMaps['read'],
    write: (async () => {}) as IConfigMaps['write'],
    writeKey: async () => {},
    readAllKeys: async () => ({})
})

interface IFakeSenderOptions {
    // it implements sendBatch (the good case) or only send (the compatibility case)
    batch?: boolean
    // the config name it claims to have
    config?: string
    throwOnBatch?: boolean
    // it fails sending this particular body, to prove it does not cut the rest short
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
    // it is injected into the instance registry, which is where getSender() takes it from
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

    // forwarding a log must not bring down whoever produces it
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

/*
    A NEW instance of the sender has to receive the configurations the core already knows about.

    It is not a laboratory case: in dev, every rebuild of a sender throws its instance away to load the
    new code, and the next one was created EMPTY. The symptom was misleading —the senders list went on
    showing the configurations, because that comes from the core's store and not from the instance— and
    only on sending did "has no config" show up, as if they had deleted themselves.
*/

test('una instancia re-creada recupera las configuraciones del core', async () => {
    const manager = new SenderManager(memConfigMaps())
    await manager.init()

    const recibidas: string[] = []
    class FakeSender {
        id = 'file'
        private nombres = new Set<string>()
        addConfig(c: { name: string }) { this.nombres.add(c.name); recibidas.push(c.name) }
        removeConfig(n: string) { this.nombres.delete(n) }
        hasConfig(n: string) { return this.nombres.has(n) }
        getConfigNames() { return [...this.nombres] }
        async startSender() {}
        async stopSender() {}
        async send() {}
    }
    ;(manager as unknown as { registeredSenders: Map<string, unknown> }).registeredSenders.set('file', FakeSender)

    // the core registers a configuration: it is stored in its store and reaches the instance
    manager.addConfig('file', { name: 'montag-test' } as never)
    assert.deepEqual(recibidas, ['montag-test'])

    // ...and now the instance is thrown away, which is what the dev reloader does after a rebuild
    ;(manager as unknown as { instances: Map<string, unknown> }).instances.delete('file')

    const nueva = manager.getSender('file')
    assert.ok(nueva)
    assert.equal(nueva!.hasConfig('montag-test'), true,
        'sin esto, un rebuild deja al sender sin configuraciones y los envios se descartan')
})
