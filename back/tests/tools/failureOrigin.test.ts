import { test } from 'node:test'
import assert from 'node:assert/strict'
import { failureOrigin } from '../../src/tools/FailureOrigin'

/*
    Whose failure it is decides whether the core dies.

    An `unhandledRejection` was always treated as fatal, so a promise without a catch inside a third-party
    extension brought the whole of Kwirth down, with all its channels and all its users. It happened with
    the 'trivy' provider: subscribing to it with no payload from provider-debug was enough.

    Now, if the failure can be attributed to an extension, it is isolated and the core carries on. And if
    it CANNOT, the behaviour of always is kept —the process exits— because a core failure may indeed have
    left the process in a state not worth trusting. That asymmetry is what these tests pin down.
*/

// A stack like the one left by a rejection born in an extension's back end, which the core loads from /tmp
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
    // it happens more than it seems: a reject('text'), a reject of an object from a library, or with no value
    assert.equal(failureOrigin('un string suelto'), undefined)
    assert.equal(failureOrigin(undefined), undefined)
    assert.equal(failureOrigin(null), undefined)
    assert.equal(failureOrigin({ code: 500 }), undefined)
})

test('un fichero que solo se PARECE al de una extension no cuenta', () => {
    const err = new Error('boom')
    // neither is the type one the core loads, nor does the name end in back.js/front.js
    err.stack = 'Error: boom\n    at x (/tmp/kwirth-something-weird-middle.js:1:1)'
    assert.equal(failureOrigin(err), undefined)
})
