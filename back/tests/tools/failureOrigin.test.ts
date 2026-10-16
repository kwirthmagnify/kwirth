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

/*
    An IdP connector's back is not required from a file: it is compiled with `new Function`, so until it
    was given a sourceURL its stack read 'eval at loadBackConnector (…), <anonymous>' — no file name,
    nobody to blame, and the core died for a connector's mistake. It happened for real: a connector
    built against a newer common-back was installed before restarting the core, its getConfigSchema()
    called an export that did not exist yet, and the process exited.
*/
test('un fallo nacido en el back de un conector IdP se atribuye a ese conector', () => {
    const err = new Error('idpRedirectUriField is not a function')
    err.stack = 'TypeError: x\n    at GitlabOnpremConnector.getConfigSchema (kwirth-idp-gitlab-onprem-back.js:71:57)'
    assert.deepEqual(failureOrigin(err), { kind: 'idp', id: 'gitlab-onprem' })
})

// What the stack looked like BEFORE the sourceURL: this is the shape that killed the core, and it must
// keep being unattributable — the point is that the name is now there, not that eval is now trusted.
test('sin nombre de fichero (eval anonimo) no hay a quien atribuir, y el core muere: era el bug', () => {
    const err = new Error('idpRedirectUriField is not a function')
    err.stack = 'TypeError: x\n    at GitlabOnpremConnector.getConfigSchema (eval at loadBackConnector (/usr/kwirth/dist/bundle.js:344133:24), <anonymous>:71:57)'
    assert.equal(failureOrigin(err), undefined)
})

/*
    An INSTALLED provider's back is not require()d either: the cached file at
    /tmp/kwirth-provider-<id>-back.js is read as TEXT and compiled with `new Function`, so the file
    existing with the right name was never enough — the name has to be in the STACK. It now gets there
    through a sourceURL, which is why the frame below has no directory in front of it.
*/
test('un fallo de un provider instalado (compilado, no require) se atribuye por su sourceURL', () => {
    const err = new Error('boom')
    err.stack = 'TypeError: boom\n    at TrivyProvider.start (kwirth-provider-trivy-back.js:120:9)'
    assert.deepEqual(failureOrigin(err), { kind: 'provider', id: 'trivy' })
})
