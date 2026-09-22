import { test } from 'node:test'
import assert from 'node:assert/strict'
import { failureOrigin } from '../../src/tools/FailureOrigin'

/*
    De quien es el fallo decide si el core se muere.

    Un `unhandledRejection` se trataba siempre como fatal, asi que una promesa sin catch dentro de una
    extension de terceros tiraba Kwirth entero, con todos sus canales y todos sus usuarios. Paso con el
    provider 'trivy': bastaba suscribirse a el sin payload desde provider-debug.

    Ahora, si el fallo se puede atribuir a una extension, se aisla y el core sigue. Y si NO se puede,
    se mantiene el comportamiento de siempre —el proceso sale—, porque un fallo del core si puede haber
    dejado el proceso en un estado del que no conviene fiarse. Esa asimetria es lo que fijan estos tests.
*/

// Un stack como el que deja un rechazo nacido en el back de una extension, que el core carga desde /tmp
const stackFromExtension = (file: string): Error => {
    const err = new TypeError('reportTypes is not iterable')
    err.stack = [
        'TypeError: reportTypes is not iterable',
        `    at TrivyProvider.sendInitialState (${file}:135:53)`,
        `    at TrivyProvider.addSubscriber (${file}:47:14)`,
        '    at ProviderDebugChannel.subscribe (/tmp/kwirth-plugin-provider-debug-back.js:245:20)',
    ].join('\n')
    return err
}

test('un fallo nacido en el back de un provider se atribuye a ese provider', () => {
    const origin = failureOrigin(stackFromExtension('/tmp/kwirth-provider-trivy-back.js'))
    assert.deepEqual(origin, { kind: 'provider', id: 'trivy' })
})

test('lo mismo para un plugin, que es el otro caso que se ha dado', () => {
    const err = new Error('boom')
    err.stack = 'Error: boom\n    at SomeChannel.processChunk (/tmp/kwirth-plugin-some-channel-back.js:1200:9)'
    assert.deepEqual(failureOrigin(err), { kind: 'plugin', id: 'some-channel' })
})

test('los ids con guiones y puntos se leen enteros', () => {
    const err = new Error('boom')
    err.stack = 'Error: boom\n    at x (/tmp/kwirth-provider-http-pull-push-back.js:10:1)'
    assert.deepEqual(failureOrigin(err), { kind: 'provider', id: 'http-pull-push' })
})

test('tambien se atribuye un fallo del front servido desde la cache', () => {
    const err = new Error('boom')
    err.stack = 'Error: boom\n    at x (/tmp/kwirth-sender-email-resend-front.js:3:1)'
    assert.deepEqual(failureOrigin(err), { kind: 'sender', id: 'email-resend' })
})

test('un fallo del CORE no se atribuye a nadie: el proceso debe seguir muriendo', () => {
    const err = new Error('boom')
    err.stack = [
        'Error: boom',
        '    at MetricsProvider.readClusterMetrics (/kwirth/back/dist/index.js:5200:11)',
        '    at processTicksAndRejections (node:internal/process/task_queues:95:5)',
    ].join('\n')
    assert.equal(failureOrigin(err), undefined)
})

test('un rechazo que no es un Error no se atribuye: sin stack no hay a quien culpar', () => {
    // pasa mas de lo que parece: un reject('texto'), un reject de un objeto de una libreria, o sin valor
    assert.equal(failureOrigin('un string suelto'), undefined)
    assert.equal(failureOrigin(undefined), undefined)
    assert.equal(failureOrigin(null), undefined)
    assert.equal(failureOrigin({ code: 500 }), undefined)
})

test('un fichero que solo se PARECE al de una extension no cuenta', () => {
    const err = new Error('boom')
    // ni el tipo es de los que carga el core, ni el nombre acaba en back.js/front.js
    err.stack = 'Error: boom\n    at x (/tmp/kwirth-something-weird-middle.js:1:1)'
    assert.equal(failureOrigin(err), undefined)
})
