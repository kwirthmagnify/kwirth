import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawn, ChildProcess } from 'child_process'
import { DCE_REGISTRY, EDceState, IDceRegistryEntry } from '@kwirthmagnify/kwirth-common'
import { IExtensionLogger, ISenderMessage } from '@kwirthmagnify/kwirth-common-back'
import ScriptSender from '../src/back/index'
import { EScriptInterpreter, EScriptStdin, EScriptTarget, IScriptRunResult, IScriptSenderConfig, IScriptStartResult } from '../src/back/types'
import { ESshDceError, ISshDce, ISshDceExecResult, ISshDceSession, ISshDceTarget, SSH_DCE_ID, TSshDceResult } from '../src/back/remote'

/*
    target = ssh, end to end on the SENDER's side: a fake DCE 'ssh' is put where getDce() looks for it, and
    it runs with REAL sh the very command the sender sends, in a home directory of its own. What the sender
    builds — the uploaded file with the KWIRTH_* variables inside, the command line, stdin — is what runs.

    The DCE itself (connection, keys, host key, SFTP, timeouts against a real SSH server) has its own tests
    in dces/ssh.
*/

const NOT_UNIX = { skip: process.platform === 'win32' ? 'the fake remote runs sh' : false }
const FINGERPRINT = 'SHA256:fakefakefakefakefakefakefakefakefakefakefak'

const ALARM: ISenderMessage = {
    subject: "It's down",
    body: 'line 1\n\ttab \'single\' "double" $HOME `id` C:\\temp 100%',
    to: ['ops@example.com'],
    level: 'error'
}

interface IFakeRemote {
    home: string
    connects: ISshDceTarget[]
    commands: string[]
    uploaded: Map<string, string>
    running: Set<ChildProcess>
    failConnect?: TSshDceResult<ISshDceSession>
    failPut?: boolean
    failRemove?: boolean
    closed: number
}

let remote: IFakeRemote

const registry = (): Record<string, IDceRegistryEntry> => {
    const g = globalThis as unknown as Record<string, Record<string, IDceRegistryEntry> | undefined>
    return (g[DCE_REGISTRY] ??= {})
}

const ok = <T>(value: T): TSshDceResult<T> => ({ ok: true, value })
const ko = <T>(error: ESshDceError, message: string): TSshDceResult<T> => ({ ok: false, failure: { error, message } })

/** Installs the fake DCE 'ssh' (or none) for one test. */
const install = (present = true): IFakeRemote => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'kwirth-script-remote-'))
    remote = { home, connects: [], commands: [], uploaded: new Map(), running: new Set(), closed: 0 }
    const r = remote
    const session: ISshDceSession = {
        fingerprint: FINGERPRINT,
        home: async () => ok(r.home),
        put: async (p, content) => {
            if (r.failPut) return ko(ESshDceError.SFTP, `cannot write '${p}': Permission denied`)
            fs.writeFileSync(p, content, { mode: 0o600 })
            r.uploaded.set(p, content)
            return ok(undefined)
        },
        remove: async p => {
            if (r.failRemove) return ko(ESshDceError.SFTP, `cannot remove '${p}': Permission denied`)
            try { fs.unlinkSync(p); return ok(undefined) }
            catch { return ko(ESshDceError.SFTP, `cannot remove '${p}'`) }
        },
        exec: (command, options) => new Promise(resolve => {
            r.commands.push(command)
            const child = spawn('sh', ['-c', command], { cwd: r.home, env: { PATH: process.env.PATH ?? '' }, detached: true })
            r.running.add(child)
            let stdout = ''
            let stderr = ''
            const timer = setTimeout(() => {
                try { process.kill(-(child.pid as number), 'SIGKILL') } catch { /* gone */ }
                resolve(ko(ESshDceError.TIMEOUT, 'the command did not finish'))
            }, options.timeoutMs)
            child.stdout.on('data', (c: Buffer) => { stdout += c.toString() })
            child.stderr.on('data', (c: Buffer) => { stderr += c.toString() })
            child.on('close', code => {
                clearTimeout(timer)
                r.running.delete(child)
                const value: ISshDceExecResult = { exitCode: code, stdout, stderr, truncated: false }
                resolve(ok(value))
            })
            child.stdin.on('error', () => {})
            child.stdin.end(options.stdin ?? '')
        }),
        close: () => {
            r.closed++
            for (const c of r.running) { try { process.kill(-(c.pid as number), 'SIGKILL') } catch { /* gone */ } }
        }
    }
    const dce: ISshDce = {
        id: SSH_DCE_ID,
        connect: async target => {
            r.connects.push(target)
            return r.failConnect ?? ok(session)
        }
    }
    if (present) registry()[SSH_DCE_ID] = { state: EDceState.LOADED, instance: dce }
    else delete registry()[SSH_DCE_ID]
    return r
}

afterEach(() => {
    delete registry()[SSH_DCE_ID]
    for (const c of remote?.running ?? []) { try { process.kill(-(c.pid as number), 'SIGKILL') } catch { /* gone */ } }
    if (remote) fs.rmSync(remote.home, { recursive: true, force: true })
})

const SSH: Partial<IScriptSenderConfig> = { target: EScriptTarget.SSH, sshHost: 'web-1.example', sshUser: 'deploy', sshPassword: 'pw' }

const configured = (config: Partial<IScriptSenderConfig>, logger?: IExtensionLogger): ScriptSender => {
    const s = new ScriptSender()
    if (logger) s.setLogger(logger)
    s.addConfig({ name: 'c', interpreter: EScriptInterpreter.SH, stdin: EScriptStdin.TEXT, env: true, script: 'cat', ...SSH, ...config })
    return s
}

const run = async (config: Partial<IScriptSenderConfig>, logger?: IExtensionLogger): Promise<IScriptRunResult> =>
    (await configured(config, logger).send('c', ALARM)) as IScriptRunResult

const quiet = (): { errors: string[], warnings: string[], logger: IExtensionLogger } => {
    const errors: string[] = []
    const warnings: string[] = []
    return { errors, warnings, logger: { info: () => {}, trace: () => {}, warning: m => warnings.push(String(m)), error: m => errors.push(String(m)) } }
}

const until = async (what: string, check: () => boolean, ms = 5000): Promise<void> => {
    const end = Date.now() + ms
    while (!check()) {
        if (Date.now() > end) assert.fail(`timed out waiting for: ${what}`)
        await new Promise(r => setTimeout(r, 20))
    }
}

// ── the form ────────────────────────────────────────────────────────────────────────────────────────

test('the schema: target local by default; the SSH fields greyed out unless target = ssh; the key is a secret textarea', () => {
    const schema = new ScriptSender().getConfigSchema()
    const by = (n: string) => schema.find(f => f.name === n)
    assert.deepEqual(by('target')?.options, ['local', 'ssh'])
    assert.equal(by('target')?.default, 'local')
    const ssh = schema.filter(f => f.name.startsWith('ssh')).map(f => f.name)
    assert.deepEqual(ssh, ['sshHost', 'sshPort', 'sshUser', 'sshPassword', 'sshPrivateKey', 'sshPassphrase', 'sshFingerprint'])
    for (const n of ssh) assert.deepEqual(by(n)?.enabledWhen, { field: 'target', values: ['ssh'] }, n)
    assert.equal(by('sshPrivateKey')?.type, 'textarea')
    assert.equal(by('sshPrivateKey')?.secret, true)
    assert.equal(by('sshPassword')?.type, 'password')
    assert.equal(by('sshPassphrase')?.type, 'password')
    assert.equal(by('sshPort')?.default, 22)
})

// ── running ─────────────────────────────────────────────────────────────────────────────────────────

test('ssh: connects with the configured fields, runs, returns the output and the host key it saw', NOT_UNIX, async () => {
    install()
    const r = await run({ sshPort: 2222, sshFingerprint: '  SHA256:abc  ', script: 'echo "on the remote"' })
    assert.deepEqual(r, { exitCode: 0, stdout: 'on the remote\n', stderr: '', truncated: false, hostFingerprint: FINGERPRINT })
    assert.deepEqual(remote.connects, [{ host: 'web-1.example', port: 2222, username: 'deploy', password: 'pw', hostFingerprint: 'SHA256:abc' }])
    assert.equal(remote.closed, 1)
})

test('ssh: a private key (with passphrase) instead of a password; port 22 when not set', NOT_UNIX, async () => {
    install()
    await run({ sshPassword: undefined, sshPrivateKey: 'KEY', sshPassphrase: 'pp', script: 'true' })
    assert.deepEqual(remote.connects[0], { host: 'web-1.example', port: 22, username: 'deploy', privateKey: 'KEY', passphrase: 'pp' })
})

test('🔴 ssh: the KWIRTH_* variables arrive EXACTLY — quotes, line breaks, $, backticks — through the uploaded file', NOT_UNIX, async () => {
    install()
    const r = await run({ stdin: EScriptStdin.NONE, script: 'printf "%s|" "$KWIRTH_SUBJECT" "$KWIRTH_BODY" "$KWIRTH_LEVEL" "$KWIRTH_TO"' })
    assert.equal(r.stdout, `${ALARM.subject}|${ALARM.body}|error|ops@example.com|`)
    assert.equal(JSON.parse(String((await run({ stdin: EScriptStdin.NONE, script: 'printf "%s" "$KWIRTH_MESSAGE"' })).stdout)).body, ALARM.body)
})

test('ssh: env off uploads no variable at all; stdin carries the body verbatim', NOT_UNIX, async () => {
    install()
    const r = await run({ env: false, script: 'env | grep -c "^KWIRTH_" || true; cat' })
    assert.equal(r.stdout, `0\n${ALARM.body}`)
    const [content] = [...remote.uploaded.values()]
    assert.ok(!content.includes('export '), 'a variable was written into the file')
})

test('ssh: a #! line stays the first one; the script goes to the home, hidden, unique, and is removed afterwards', NOT_UNIX, async () => {
    install()
    await run({ script: '#!/bin/sh\necho hi' })
    const [[file, content]] = [...remote.uploaded.entries()]
    assert.match(path.basename(file), /^\.kwirth-script-[0-9a-f-]{36}\.sh$/)
    assert.equal(path.dirname(file), remote.home)
    assert.ok(content.startsWith('#!/bin/sh\nexport KWIRTH_BODY='))
    assert.equal(fs.existsSync(file), false, 'the remote file was left behind')
    assert.deepEqual(remote.commands, [`sh '${file}'`])
})

test('ssh: an exit code other than 0 fails the delivery naming the machine and quoting stderr', NOT_UNIX, async () => {
    install()
    await assert.rejects(run({ script: 'echo "disk full" >&2; exit 4' }), /config 'c': the script exited with code 4 on web-1\.example:22: disk full/)
    assert.equal(remote.closed, 1)
    assert.equal(remote.uploaded.size, 1)
    assert.equal(fs.existsSync([...remote.uploaded.keys()][0]), false)
})

test('ssh: past the timeout it fails saying the channel was closed', NOT_UNIX, async () => {
    install()
    await assert.rejects(run({ timeoutSeconds: 1, script: 'sleep 30' }), /did not finish within 1 s on web-1\.example:22 and its SSH channel was closed/)
})

// ── what fails before running ───────────────────────────────────────────────────────────────────────

test('ssh: missing host, user or credential is said before connecting', async () => {
    install()
    await assert.rejects(run({ sshHost: ' ' }), /no SSH host is configured/)
    await assert.rejects(run({ sshUser: '' }), /no SSH user is configured/)
    await assert.rejects(run({ sshPassword: '' }), /neither an SSH password nor a private key/)
    assert.equal(remote.connects.length, 0)
})

test('ssh: without the DCE installed, the error says which DCE is needed', async () => {
    install(false)
    await assert.rejects(run({}), /running on another machine needs the DCE 'ssh' \(Manage extensions → DCE\): DCE 'ssh' is not loaded/)
})

test('ssh: what the DCE says about connecting is the error — e.g. a host key that does not match', async () => {
    install()
    remote.failConnect = { ok: false, failure: { error: ESshDceError.HOST_KEY, message: 'the host key of web-1.example is SHA256:zzz, not the expected one', fingerprint: 'SHA256:zzz' } }
    await assert.rejects(run({}), /config 'c': the host key of web-1\.example is SHA256:zzz, not the expected one/)
})

test('ssh: an upload that fails closes the connection and fails the delivery', NOT_UNIX, async () => {
    install()
    remote.failPut = true
    await assert.rejects(run({}), /cannot write '.*\.kwirth-script-.*\.sh': Permission denied/)
    assert.equal(remote.closed, 1)
    assert.equal(remote.commands.length, 0)
})

test('ssh: a temporary file that cannot be removed does not fail the delivery — it is a warning in the log', NOT_UNIX, async () => {
    install()
    remote.failRemove = true
    const { warnings, logger } = quiet()
    const r = await run({ sshFingerprint: FINGERPRINT, script: 'echo ok' }, logger)
    assert.equal(r.stdout, 'ok\n')
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /config 'c': the temporary script could not be removed from web-1\.example:22: cannot remove/)
})

test('🔴 ssh without a fingerprint: it runs, and the log says ONCE which host key went unchecked — again after the config changes', NOT_UNIX, async () => {
    install()
    const { warnings, logger } = quiet()
    const s = configured({ script: 'true' }, logger)
    await s.send('c', ALARM)
    await s.send('c', ALARM)
    assert.deepEqual(warnings, [`config 'c': the host key of web-1.example was not checked (no fingerprint configured): it is ${FINGERPRINT}`])
    s.addConfig({ name: 'c', interpreter: EScriptInterpreter.SH, stdin: EScriptStdin.TEXT, env: true, script: 'true', ...SSH })
    await s.send('c', ALARM)
    assert.equal(warnings.length, 2)
    // With the fingerprint configured there is nothing to warn about.
    s.addConfig({ name: 'c', interpreter: EScriptInterpreter.SH, stdin: EScriptStdin.TEXT, env: true, script: 'true', ...SSH, sshFingerprint: FINGERPRINT })
    await s.send('c', ALARM)
    assert.equal(warnings.length, 2)
})

// ── not waiting ─────────────────────────────────────────────────────────────────────────────────────

test('ssh, wait=off: returns once connected and uploaded, with the host; a later failure reaches the log', NOT_UNIX, async () => {
    install()
    const { errors, logger } = quiet()
    const started = Date.now()
    const r = await configured({ wait: false, script: 'sleep 1; echo "401" >&2; exit 3' }, logger).send('c', ALARM) as IScriptStartResult
    assert.ok(Date.now() - started < 800, 'it waited for the script')
    assert.deepEqual(r, { started: true, host: 'web-1.example' })
    await until('the error is logged', () => errors.length === 1)
    assert.match(errors[0], /config 'c': background run ssh web-1\.example: the script exited with code 3 on web-1\.example:22: 401/)
})

test('ssh, wait=off: a connection that fails still fails the delivery', async () => {
    install()
    remote.failConnect = { ok: false, failure: { error: ESshDceError.AUTH, message: 'web-1.example:22: All configured authentication methods failed' } }
    await assert.rejects(configured({ wait: false }).send('c', ALARM), /All configured authentication methods failed/)
})

test('ssh, wait=off: stopping the sender closes the connections still running', NOT_UNIX, async () => {
    install()
    const s = configured({ wait: false, timeoutSeconds: 30, script: 'sleep 30' })
    await s.send('c', ALARM)
    await until('the remote command runs', () => remote.running.size === 1)
    await s.stopSender()
    assert.ok(remote.closed >= 1, 'stop did not close the connection')
    await until('the remote command is gone', () => remote.running.size === 0)
})
