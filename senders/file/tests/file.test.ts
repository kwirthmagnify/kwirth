import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import FileSender from '../src/back/index'

/*
    The `file` sender, and above all its BATCH delivery.

    Writing to a file looks like the simplest thing there is, and that is why nobody looks there: the
    rotation when a batch crosses the limit, a batch's format being the SAME as a single line's, and the
    origin appearing only when asked for. All three break silently — the file still has lines in it, just
    the wrong ones.
*/

const tmp = (): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-sender-'))
    return path.join(dir, 'salida.log')
}

const crea = async (config: Record<string, unknown>) => {
    const sender = new FileSender()
    sender.addConfig(config as never)
    return sender
}

const lee = (ruta: string): string[] =>
    fs.existsSync(ruta) ? fs.readFileSync(ruta, 'utf-8').split('\n').filter(l => l !== '') : []

test('un lote se escribe entero y en orden', async () => {
    const ruta = tmp()
    const sender = await crea({ name: 'c', filePath: ruta, timestamps: false, levels: false })

    await sender.sendBatch!('c', [{ body: 'primera' }, { body: 'segunda' }, { body: 'tercera' }])

    assert.deepEqual(lee(ruta), ['primera', 'segunda', 'tercera'])
})

test('el formato de un lote es el MISMO que el de una linea suelta', async () => {
    const rutaA = tmp(), rutaB = tmp()
    const suelto = await crea({ name: 'a', filePath: rutaA, timestamps: false, levels: true })
    const lote = await crea({ name: 'b', filePath: rutaB, timestamps: false, levels: true })

    await suelto.send('a', { body: 'hola', level: 'warn' })
    await lote.sendBatch!('b', [{ body: 'hola', level: 'warn' }])

    assert.deepEqual(lee(rutaA), lee(rutaB), 'un lote es un detalle de rendimiento, no otro formato')
})

test('un lote vacio no crea ni toca el fichero', async () => {
    const ruta = tmp()
    const sender = await crea({ name: 'c', filePath: ruta })

    await sender.sendBatch!('c', [])

    assert.equal(fs.existsSync(ruta), false)
})

test('el origen sale solo si la configuracion lo pide', async () => {
    const sinOrigen = tmp(), conOrigen = tmp()
    const a = await crea({ name: 'a', filePath: sinOrigen, timestamps: false, levels: false })
    const b = await crea({ name: 'b', filePath: conOrigen, timestamps: false, levels: false, origin: true })
    const mensaje = { body: 'algo paso', origin: { namespace: 'produccion', pod: 'api-7', container: 'api' } }

    await a.sendBatch!('a', [mensaje])
    await b.sendBatch!('b', [mensaje])

    assert.deepEqual(lee(sinOrigen), ['algo paso'], 'por defecto, los ficheros de siempre no cambian de forma')
    assert.deepEqual(lee(conOrigen), ['[produccion/api-7/api] algo paso'])
})

test('sin pod, el origen se identifica por su servicio', async () => {
    const ruta = tmp()
    const sender = await crea({ name: 'c', filePath: ruta, timestamps: false, levels: false, origin: true })

    // a business event, or the log of a server with no containers
    await sender.sendBatch!('c', [{ body: 'linea', origin: { service: 'facturacion' } }])

    assert.deepEqual(lee(ruta), ['[facturacion] linea'])
})

test('una linea de una MAQUINA lleva su host Y el servicio que la produjo', async () => {
    const ruta = tmp()
    const sender = await crea({ name: 'c', filePath: ruta, timestamps: false, levels: false, origin: true })

    /*
        Log from outside a cluster: there is no namespace, and whoever produces it puts the HOST in the
        pod's field, because that is what a destination expects as its host. If the Kubernetes trio is
        taken as soon as there is a pod, the service is lost — and one machine runs many, so all of its
        lines end up looking the same.
    */
    await sender.sendBatch!('c', [{ body: 'latido', origin: { pod: 'windows-dev', service: 'demo-app' } }])

    assert.deepEqual(lee(ruta), ['[windows-dev/demo-app] latido'])
})

test('y una de un cluster sigue siendo namespace/pod/container', async () => {
    const ruta = tmp()
    const sender = await crea({ name: 'c', filePath: ruta, timestamps: false, levels: false, origin: true })

    // the service does NOT sneak in here: inside a cluster the container already says what it is
    await sender.sendBatch!('c', [{ body: 'linea', origin: { namespace: 'produccion', pod: 'api-7', container: 'api', service: 'pagos' } }])

    assert.deepEqual(lee(ruta), ['[produccion/api-7/api] linea'])
})

test('un mensaje sin origen no deja corchetes vacios', async () => {
    const ruta = tmp()
    const sender = await crea({ name: 'c', filePath: ruta, timestamps: false, levels: false, origin: true })

    await sender.sendBatch!('c', [{ body: 'sin origen' }])

    assert.deepEqual(lee(ruta), ['sin origen'])
})

test('la rotacion cuenta el lote ENTERO, no lo deja pasar por ser una sola escritura', async () => {
    const ruta = tmp()
    const sender = await crea({ name: 'c', filePath: ruta, timestamps: false, levels: false, maxLines: 5 })

    await sender.sendBatch!('c', [{ body: '1' }, { body: '2' }, { body: '3' }])
    await sender.sendBatch!('c', [{ body: '4' }, { body: '5' }, { body: '6' }])

    // the second batch crosses the limit: it rotates BEFORE writing it, and the live file keeps it
    assert.deepEqual(lee(ruta), ['4', '5', '6'])
    const rotados = fs.readdirSync(path.dirname(ruta)).filter(f => f.includes('.bak'))
    assert.equal(rotados.length, 1, 'y lo anterior no se pierde: queda en el .bak')
})

test('sin maxLines no rota nunca', async () => {
    const ruta = tmp()
    const sender = await crea({ name: 'c', filePath: ruta, timestamps: false, levels: false })

    for (let i = 0; i < 50; i++) await sender.sendBatch!('c', [{ body: `linea ${i}` }])

    assert.equal(lee(ruta).length, 50)
    assert.equal(fs.readdirSync(path.dirname(ruta)).filter(f => f.includes('.bak')).length, 0)
})

test('una config que no existe se queja, en vez de escribir en cualquier sitio', async () => {
    const sender = await crea({ name: 'c', filePath: tmp() })

    await assert.rejects(() => sender.sendBatch!('la-que-no-es', [{ body: 'x' }]))
})

test('send y sendBatch comparten el contador de lineas', async () => {
    const ruta = tmp()
    const sender = await crea({ name: 'c', filePath: ruta, timestamps: false, levels: false, maxLines: 4 })

    await sender.send('c', { body: 'a' })
    await sender.send('c', { body: 'b' })
    // this batch crosses the limit counting the two loose ones before it as well
    await sender.sendBatch!('c', [{ body: 'c' }, { body: 'd' }, { body: 'e' }])

    assert.deepEqual(lee(ruta), ['c', 'd', 'e'])
})

test('cada linea lleva SU hora, no la del momento en que se escribio el lote', async () => {
    const ruta = tmp()
    const sender = await crea({ name: 'c', filePath: ruta, timestamps: true, levels: false })

    // two lines from different moments, delivered in the SAME batch
    await sender.sendBatch!('c', [
        { body: 'antes', origin: { timestamp: Date.parse('2026-09-23T08:00:00.000Z') } },
        { body: 'despues', origin: { timestamp: Date.parse('2026-09-23T08:00:05.000Z') } }
    ])

    const lineas = lee(ruta)
    assert.ok(lineas[0].startsWith('[2026-09-23T08:00:00.000Z]'), lineas[0])
    assert.ok(lineas[1].startsWith('[2026-09-23T08:00:05.000Z]'), lineas[1])
})

test('sin hora propia se usa la de escritura: una linea sin fecha sigue siendo una linea', async () => {
    const ruta = tmp()
    const sender = await crea({ name: 'c', filePath: ruta, timestamps: true, levels: false })

    await sender.sendBatch!('c', [{ body: 'sin hora' }])

    assert.match(lee(ruta)[0], /^\[\d{4}-\d{2}-\d{2}T/)
})

test('levels apagado EXPLICITAMENTE no pinta el nivel', async () => {
    const ruta = tmp()
    // the case that failed: the dialog omitted the key when it was unchecked and the sender applied
    // its default (true), so the switch looked off and the level came out all the same
    const sender = await crea({ name: 'c', filePath: ruta, timestamps: false, levels: false })

    await sender.sendBatch!('c', [{ body: 'sin nivel', level: 'warn' }])

    assert.deepEqual(lee(ruta), ['sin nivel'])
})

test('sin decir nada sobre levels, se pinta: es el defecto declarado en el esquema', async () => {
    const ruta = tmp()
    const sender = await crea({ name: 'c', filePath: ruta, timestamps: false })

    await sender.sendBatch!('c', [{ body: 'con nivel', level: 'warn' }])

    assert.deepEqual(lee(ruta), ['[WARN] con nivel'])
})
