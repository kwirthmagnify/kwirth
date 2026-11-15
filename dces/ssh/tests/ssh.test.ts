// DCE `ssh` against a real SSH server running in this process (tests/server.ts): every value is checked,
// not just "it did not throw".

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'fs'
import { createServer, AddressInfo } from 'net'
import path from 'path'
import { ESshError, ISshSession, ISshTarget, TSshResult } from '../src/common/index'
import dce, { createSsh } from '../src/back/index'
import { OutputTail, classifyConnectError, connect, fingerprintOf, normalizeFingerprint } from '../src/back/client'
import { IDceBackHost, IDceStore } from '@kwirthmagnify/kwirth-common-back'
import { ITestServer, PASSWORD, USER, hostFingerprint, startServer } from './server'

const NOT_UNIX = { skip: process.platform === 'win32' ? 'the test server runs commands with sh' : false }

let srv: ITestServer
before(async () => { srv = await startServer() })
after(async () => { await srv.close() })

const target = (extra: Partial<ISshTarget> = {}): ISshTarget => ({ host: '127.0.0.1', port: srv.port, username: USER, password: PASSWORD, ...extra })

/** The value of a result that must be ok — the failure, if any, is the assertion message. */
const value = <T>(r: TSshResult<T>): T => {
    if (!r.ok) assert.fail(`${r.failure.error}: ${r.failure.message}`)
    return r.value
}

const failure = <T>(r: TSshResult<T>) => {
    if (r.ok) assert.fail('expected a failure')
    return r.failure
}

/** Connects, runs `use`, and closes always. */
const withSession = async <T>(t: ISshTarget, use: (s: ISshSession) => Promise<T>): Promise<T> => {
    const s = value(await connect(t))
    try { return await use(s) }
    finally { s.close() }
}

// ── units ───────────────────────────────────────────────────────────────────────────────────────────

test('fingerprints are compared without the SHA256: prefix (any case) and without padding', () => {
    assert.equal(normalizeFingerprint(' SHA256:abc+/= '), 'abc+/')
    assert.equal(normalizeFingerprint('sha256:abc'), 'abc')
    assert.equal(normalizeFingerprint('abc=='), 'abc')
    assert.match(fingerprintOf(Buffer.from('x')), /^SHA256:[A-Za-z0-9+/]{43}$/)
})

test('the output tail keeps the LAST bytes and says it dropped some', () => {
    const t = new OutputTail(5)
    t.push(Buffer.from('abc'))
    assert.equal(t.truncated, false)
    t.push(Buffer.from('defg'))
    assert.equal(t.text(), 'cdefg')
    assert.equal(t.truncated, true)
    t.push(Buffer.from('0123456789'))
    assert.equal(t.text(), '56789')
})

test('connection errors are told apart: credentials, network, the rest', () => {
    assert.equal(classifyConnectError(Object.assign(new Error('x'), { level: 'client-authentication' })), ESshError.AUTH)
    assert.equal(classifyConnectError(Object.assign(new Error('x'), { level: 'client-timeout' })), ESshError.UNREACHABLE)
    assert.equal(classifyConnectError(Object.assign(new Error('x'), { code: 'ENOTFOUND' })), ESshError.UNREACHABLE)
    assert.equal(classifyConnectError(Object.assign(new Error('x'), { code: 'ECONNREFUSED' })), ESshError.UNREACHABLE)
    assert.equal(classifyConnectError(new Error('x')), ESshError.FAILED)
})

test('the factory builds the client under the id the core installed it with, and logs it', async () => {
    const memory: IDceStore = { read: async (_n, d) => d, write: async () => {} }
    const logged: string[] = []
    const host: IDceBackHost = { id: 'ssh', logger: { info: m => logged.push(String(m)), warning: () => {}, error: () => {} }, configMaps: memory, secrets: memory, libs: {} }
    const instance = await dce.create(host)
    assert.equal(instance.id, 'ssh')
    assert.equal(typeof instance.connect, 'function')
    assert.deepEqual(logged, ['ssh client ready'])
    assert.equal(createSsh('other').id, 'other')
})

// ── connecting ──────────────────────────────────────────────────────────────────────────────────────

test('without host, user or any credential it fails at once, without connecting', async () => {
    assert.equal(failure(await connect(target({ host: '' }))).error, ESshError.FAILED)
    assert.equal(failure(await connect(target({ username: '' }))).error, ESshError.AUTH)
    const f = failure(await connect(target({ password: undefined })))
    assert.equal(f.error, ESshError.AUTH)
    assert.equal(f.message, 'neither a password nor a private key')
})

test('password: connects and reports the host key it saw, the same ssh-keygen would print', async () => {
    await withSession(target(), async s => {
        assert.equal(s.fingerprint, hostFingerprint(srv.hostPublic))
    })
})

test('a wrong password is AUTH — and the message does not carry it', async () => {
    const f = failure(await connect(target({ password: 'not-it' })))
    assert.equal(f.error, ESshError.AUTH)
    assert.ok(!f.message.includes('not-it'))
})

test('private key without passphrase', async () => {
    await withSession(target({ password: undefined, privateKey: srv.clientKey.private }), async s => {
        assert.equal(value(await s.exec('echo key', { timeoutMs: 5000 })).stdout, 'key\n')
    })
})

test('private key with passphrase: right one connects, wrong one is AUTH', async () => {
    await withSession(target({ password: undefined, privateKey: srv.clientKeyWithPassphrase.private, passphrase: srv.passphrase }), async s => {
        assert.equal(value(await s.exec('echo locked', { timeoutMs: 5000 })).exitCode, 0)
    })
    const f = failure(await connect(target({ password: undefined, privateKey: srv.clientKeyWithPassphrase.private, passphrase: 'wrong' })))
    assert.equal(f.error, ESshError.AUTH)
    assert.ok(!f.message.includes('wrong'))
})

test('a private key that is not a key is AUTH, saying so', async () => {
    const f = failure(await connect(target({ password: undefined, privateKey: 'not a key' })))
    assert.equal(f.error, ESshError.AUTH)
    assert.match(f.message, /private key/)
})

test('🔴 expected fingerprint: matching (with or without prefix/padding) connects; another one is HOST_KEY with the real one', async () => {
    const real = hostFingerprint(srv.hostPublic)
    for (const typed of [real, real.replace(/^SHA256:/, ''), 'sha256:' + real.slice(7) + '=']) {
        await withSession(target({ hostFingerprint: typed }), async s => assert.equal(s.fingerprint, real))
    }
    const f = failure(await connect(target({ hostFingerprint: 'SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' })))
    assert.equal(f.error, ESshError.HOST_KEY)
    assert.equal(f.fingerprint, real)
    assert.equal(f.message, `the host key of 127.0.0.1 is ${real}, not the expected SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`)
})

test('nothing listening is UNREACHABLE, naming host and port', async () => {
    const probe = createServer()
    await new Promise<void>(r => probe.listen(0, '127.0.0.1', () => r()))
    const port = (probe.address() as AddressInfo).port
    await new Promise<void>(r => probe.close(() => r()))
    const f = failure(await connect(target({ port, connectTimeoutMs: 3000 })))
    assert.equal(f.error, ESshError.UNREACHABLE)
    assert.match(f.message, new RegExp(`127\\.0\\.0\\.1:${port}`))
})

// ── exec ────────────────────────────────────────────────────────────────────────────────────────────

test('exec: stdout, stderr and exit code as the command left them', NOT_UNIX, async () => {
    await withSession(target(), async s => {
        const r = value(await s.exec('echo out; echo err >&2; exit 3', { timeoutMs: 5000 }))
        assert.deepEqual(r, { exitCode: 3, stdout: 'out\n', stderr: 'err\n', truncated: false })
    })
})

test('exec: stdin reaches the command verbatim, and without it stdin is closed (no hang)', NOT_UNIX, async () => {
    await withSession(target(), async s => {
        const text = 'line 1\n\ttab "quotes" $HOME \\ back\n'
        assert.equal(value(await s.exec('cat', { stdin: text, timeoutMs: 5000 })).stdout, text)
        assert.equal(value(await s.exec('cat', { timeoutMs: 5000 })).stdout, '')
    })
})

test('exec: past the timeout it is TIMEOUT at once — without waiting for a remote process that goes on', NOT_UNIX, async () => {
    await withSession(target(), async s => {
        const started = Date.now()
        const f = failure(await s.exec('sleep 30', { timeoutMs: 400 }))
        assert.equal(f.error, ESshError.TIMEOUT)
        assert.match(f.message, /did not finish within 0 s|did not finish within 1 s/)
        assert.ok(Date.now() - started < 2000, 'the timeout waited for the remote process')
        /*
            🔴 Like OpenSSH (checked against 10.3), closing the channel does NOT kill the remote process: the
            test server keeps it, and the README and the guides say so. Only the session is the DCE's.
        */
        assert.equal(srv.running.size, 1)
        // The session is still usable after a timed-out command.
        assert.equal(value(await s.exec('echo after', { timeoutMs: 5000 })).stdout, 'after\n')
    })
    for (const child of srv.running) if (child.pid) process.kill(-child.pid, 'SIGKILL')
})

test('exec: maxOutputBytes keeps the end of the output and says it was truncated', NOT_UNIX, async () => {
    await withSession(target(), async s => {
        const r = value(await s.exec('i=0; while [ $i -lt 2000 ]; do echo "line $i"; i=$((i+1)); done', { timeoutMs: 10000, maxOutputBytes: 20 }))
        assert.equal(r.truncated, true)
        assert.equal(r.stdout.length, 20)
        assert.ok(r.stdout.endsWith('line 1999\n'))
    })
})

// ── SFTP ────────────────────────────────────────────────────────────────────────────────────────────

test('SFTP: home, put (private, verbatim), remove', NOT_UNIX, async () => {
    await withSession(target(), async s => {
        const home = value(await s.home())
        assert.equal(home, srv.root)
        const file = path.join(home, '.kwirth-test.sh')
        // printf, not echo: dash's echo turns '\t' into a tab.
        const content = "#!/bin/sh\nprintf '%s\\n' 'C:\\temp'\n\ttrue\n"
        value(await s.put(file, content))
        assert.equal(readFileSync(file, 'utf8'), content)
        assert.equal(statSync(file).mode & 0o777, 0o600)
        assert.equal(value(await s.exec(`sh '${file}'`, { timeoutMs: 5000 })).stdout, 'C:\\temp\n')
        value(await s.remove(file))
        assert.equal(existsSync(file), false)
    })
})

test('SFTP failures are SFTP, naming the path', NOT_UNIX, async () => {
    await withSession(target(), async s => {
        const missing = path.join(srv.root, 'nope.txt')
        const f = failure(await s.remove(missing))
        assert.equal(f.error, ESshError.SFTP)
        assert.match(f.message, /nope\.txt/)
        const g = failure(await s.put(path.join(srv.root, 'no-dir', 'x.sh'), 'x'))
        assert.equal(g.error, ESshError.SFTP)
    })
})
