import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import { spawnSync } from 'child_process'
import path from 'path'
import { IExtensionLogger, ISenderMessage } from '@kwirthmagnify/kwirth-common-back'
import ScriptSender, { MAX_BACKGROUND_RUNS } from '../src/back/index'
import { EScriptInterpreter, EScriptStdin, IScriptRunResult, IScriptSenderConfig, IScriptStartResult } from '../src/back/types'

/*
    The script sender running REAL scripts on this host (plans/sender-script/PRD.md §10). The sh/bash ones
    run on Linux and macOS; the cmd/PowerShell ones only on Windows — each skipped elsewhere, never adapted.
*/

const onWindows = process.platform === 'win32'
const NOT_UNIX = { skip: onWindows ? 'sh/bash: Unix only' : false }
const NOT_WINDOWS = { skip: onWindows ? false : 'cmd/PowerShell: Windows only' }
// Kwirth's own image (Alpine) has no bash: there the test is skipped, and its absence is what the
// 'interpreter not available' test is about.
const hasBash = !onWindows && spawnSync('bash', ['-c', 'true']).status === 0
const NO_BASH = { skip: hasBash ? false : 'bash is not installed on this host' }

const ALARM: ISenderMessage = {
    subject: 'Pod crashed',
    body: 'api-1 restarted 5 times\n\tlast exit: 137 — "OOMKilled" C:\\temp\\new.txt $HOME `id`',
    to: ['ops@example.com', 'sre@example.com'],
    level: 'error',
    origin: { cluster: 'prod', namespace: 'shop', pod: 'api-1', timestamp: 1700000000000 }
}

const configured = (config: Partial<IScriptSenderConfig>, logger?: IExtensionLogger): ScriptSender => {
    const s = new ScriptSender()
    if (logger) s.setLogger(logger)
    s.addConfig({ name: 'c', interpreter: EScriptInterpreter.SH, stdin: EScriptStdin.TEXT, env: true, script: 'cat', ...config })
    return s
}

// A configuration that WAITS (the default): what comes back is the run's result.
const sender = (config: Partial<IScriptSenderConfig>, logger?: IExtensionLogger) => {
    const s = configured(config, logger)
    return {
        send: async (name: string, message: ISenderMessage) => (await s.send(name, message)) as IScriptRunResult,
        sendBatch: async (name: string, messages: ISenderMessage[]) => (await s.sendBatch(name, messages)) as IScriptRunResult | undefined
    }
}

/** Waits until a condition holds — never a fixed sleep — or fails after `ms`. */
const until = async (what: string, check: () => boolean, ms = 5000): Promise<void> => {
    const end = Date.now() + ms
    while (!check()) {
        if (Date.now() > end) throw new Error(`timed out waiting for: ${what}`)
        await new Promise(r => setTimeout(r, 50))
    }
}

const alive = (pid: number): boolean => { try { process.kill(pid, 0); return true } catch { return false } }
/** The pid of a LOCAL run started without waiting: it must be there. */
const pidOf = (r: IScriptStartResult): number => {
    assert.equal(typeof r.pid, 'number', 'a local start carries its pid')
    return r.pid as number
}

const scratch = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'kwirth-script-test-'))

// ─── configuration ───────────────────────────────────────────────────────────

test('the schema: script is a textarea the AI can draft; interpreters and stdin modes are selects', () => {
    const schema = new ScriptSender().getConfigSchema()
    const by = (n: string) => schema.find(f => f.name === n)
    assert.equal(schema[0].name, 'name')
    assert.equal(by('script')?.type, 'textarea')
    assert.equal(by('script')?.required, true)
    assert.match(by('script')?.aiInstructions ?? '', /KWIRTH_BODY/)
    assert.deepEqual(by('interpreter')?.options, ['sh', 'bash', 'pwsh', 'powershell', 'cmd'])
    assert.equal(by('interpreter')?.default, 'sh')
    assert.deepEqual(by('stdin')?.options, ['none', 'text', 'json'])
    assert.equal(by('stdin')?.default, 'text')
    assert.equal(by('env')?.default, true)
    assert.equal(by('wait')?.type, 'boolean')
    assert.equal(by('wait')?.default, true)
    assert.equal(by('timeoutSeconds')?.default, 30)
})

test('keeps its configurations by name, and forgets them on stop', async () => {
    const s = new ScriptSender()
    s.addConfig({ name: 'a' })
    s.addConfig({ name: 'b' })
    assert.deepEqual(s.getConfigNames(), ['a', 'b'])
    s.removeConfig('a')
    assert.equal(s.hasConfig('a'), false)
    await s.stopSender()
    assert.deepEqual(s.getConfigNames(), [])
})

test('a configuration that cannot run says why, before running anything', async () => {
    await assert.rejects(new ScriptSender().send('missing', { body: 'x' }), /config 'missing' not found/)
    await assert.rejects(sender({ script: '   ' }).send('c', { body: 'x' }), /has no script/)
    await assert.rejects(sender({ interpreter: 'zsh' as EScriptInterpreter }).send('c', { body: 'x' }), /unknown interpreter 'zsh'/)
    await assert.rejects(sender({ stdin: 'xml' as EScriptStdin }).send('c', { body: 'x' }), /unknown standard input mode 'xml'/)
})

// ─── sh / bash ───────────────────────────────────────────────────────────────

test('stdin=text: the script gets the body EXACTLY — quotes, tabs, backslashes, $ and backticks untouched', NOT_UNIX, async () => {
    const r = await sender({ script: 'cat' }).send('c', ALARM)
    assert.equal(r.exitCode, 0)
    assert.equal(r.stdout, ALARM.body)
    assert.equal(r.truncated, false)
})

test('stdin=json: the script gets the whole message, which parses back to what was sent', NOT_UNIX, async () => {
    const r = await sender({ stdin: EScriptStdin.JSON, script: 'cat' }).send('c', ALARM)
    assert.deepEqual(JSON.parse(r.stdout), ALARM)
})

test('stdin=none: stdin is closed at once, so a script that reads it does not hang', NOT_UNIX, async () => {
    const r = await sender({ stdin: EScriptStdin.NONE, script: 'cat; echo done', timeoutSeconds: 5 }).send('c', ALARM)
    assert.equal(r.stdout, 'done\n')
})

test('env=on: the five KWIRTH_* variables carry the message', NOT_UNIX, async () => {
    const script = 'printf "%s|%s|%s|%s\\n" "$KWIRTH_SUBJECT" "$KWIRTH_LEVEL" "$KWIRTH_TO" "$KWIRTH_BODY"; printf "%s" "$KWIRTH_MESSAGE" >&2'
    const r = await sender({ stdin: EScriptStdin.NONE, script }).send('c', ALARM)
    assert.equal(r.stdout, `Pod crashed|error|ops@example.com,sre@example.com|${ALARM.body}\n`)
    assert.deepEqual(JSON.parse(r.stderr), ALARM)
})

test('env=off: no KWIRTH_* variable at all', NOT_UNIX, async () => {
    const r = await sender({ env: false, stdin: EScriptStdin.NONE, script: 'env | grep -c "^KWIRTH_" || true' }).send('c', ALARM)
    assert.equal(r.stdout.trim(), '0')
})

test('🔴 the script does NOT see the back end\'s environment — only the whitelist', NOT_UNIX, async () => {
    process.env.DB_PASSWORD = 'never-seen'
    process.env.KWIRTH_MASTERKEY_TEST = 'never-seen-either'
    try {
        const r = await sender({ env: false, stdin: EScriptStdin.NONE, script: 'env' }).send('c', ALARM)
        assert.ok(!r.stdout.includes('never-seen'), 'a variable of the back end reached the script')
        const names = r.stdout.split('\n').filter(Boolean).map(l => l.split('=')[0])
        const allowed = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TZ', 'TMPDIR', 'PWD', 'SHLVL', '_', 'OLDPWD']
        // Node itself re-adds NODE_V8_COVERAGE to every child, whatever env it is given, while c8 measures
        // the run (COVERAGE=1): it is the test runner's, never present in the back end.
        if (process.env.NODE_V8_COVERAGE) allowed.push('NODE_V8_COVERAGE')
        assert.deepEqual(names.filter(n => !allowed.includes(n)), [], 'only the whitelist (plus what sh sets itself)')
        assert.ok(names.includes('PATH'))
    }
    finally {
        delete process.env.DB_PASSWORD
        delete process.env.KWIRTH_MASTERKEY_TEST
    }
})

test('a batch is ONE run: json gets an array of N, text gets N lines', NOT_UNIX, async () => {
    const dir = scratch()
    const runs = path.join(dir, 'runs')
    try {
        const batch: ISenderMessage[] = [{ body: 'one' }, { body: 'two' }, { body: 'three' }]
        const json = await sender({ stdin: EScriptStdin.JSON, script: `echo run >> "${runs}"; cat` }).sendBatch('c', batch)
        assert.deepEqual(JSON.parse(json!.stdout), batch)
        const text = await sender({ stdin: EScriptStdin.TEXT, script: `echo run >> "${runs}"; cat` }).sendBatch('c', batch)
        assert.equal(text!.stdout, 'one\ntwo\nthree')
        assert.equal(fs.readFileSync(runs, 'utf8'), 'run\nrun\n', 'two batches, two runs — not six')
        assert.equal(await new ScriptSender().sendBatch('c', []), undefined, 'an empty batch runs nothing')
    }
    finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('a batch with env: KWIRTH_BODY one per line, KWIRTH_MESSAGE the array, no subject', NOT_UNIX, async () => {
    const r = await sender({ stdin: EScriptStdin.NONE, script: 'printf "%s" "$KWIRTH_BODY"; printf "%s" "$KWIRTH_MESSAGE" >&2; [ -z "${KWIRTH_SUBJECT+x}" ] || exit 9' })
        .sendBatch('c', [{ body: 'a', subject: 's' }, { body: 'b' }])
    assert.equal(r!.stdout, 'a\nb')
    assert.deepEqual(JSON.parse(r!.stderr), [{ body: 'a', subject: 's' }, { body: 'b' }])
})

test('the script runs as written: backslashes, tabs and a CRLF typed on Windows', NOT_UNIX, async () => {
    const r = await sender({ stdin: EScriptStdin.NONE, script: "printf '%s\\n' 'C:\\temp\\new.txt'\r\nprintf 'a\\tb\\n'\r\n" }).send('c', ALARM)
    assert.equal(r.stdout, 'C:\\temp\\new.txt\na\tb\n')
})

test('bash runs bash', NO_BASH, async () => {
    const r = await sender({ interpreter: EScriptInterpreter.BASH, stdin: EScriptStdin.NONE, script: 'a=(x y z); echo "${#a[@]} ${BASH_VERSION%%.*}"' }).send('c', ALARM)
    assert.match(r.stdout, /^3 \d+\n$/)
})

test('a non-zero exit fails the delivery, with the code and what the script wrote to stderr — and logs it', NOT_UNIX, async () => {
    const errors: string[] = []
    const logger: IExtensionLogger = { info: () => {}, trace: () => {}, warning: () => {}, error: m => errors.push(String(m)) }
    await assert.rejects(sender({ script: 'echo "webhook answered 401" >&2; exit 3' }, logger).send('c', ALARM),
        /config 'c': the script exited with code 3: webhook answered 401/)
    assert.equal(errors.length, 1)
    assert.match(errors[0], /exited with code 3/)
})

test('a script past its timeout is killed — WITH what it started — and the delivery fails', NOT_UNIX, async () => {
    const dir = scratch()
    const pidFile = path.join(dir, 'pid')
    try {
        const started = Date.now()
        await assert.rejects(sender({ timeoutSeconds: 1, stdin: EScriptStdin.NONE, script: `sleep 30 & echo $! > "${pidFile}"; wait` }).send('c', ALARM),
            /did not finish within 1 s and was killed/)
        assert.ok(Date.now() - started < 5000, 'it must not wait for the sleep')
        const pid = Number(fs.readFileSync(pidFile, 'utf8').trim())
        await new Promise(r => setTimeout(r, 200))
        assert.throws(() => process.kill(pid, 0), 'the sleep the script started is still alive')
    }
    finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('an interpreter that is not on this host is said in words, not as a raw ENOENT', NOT_UNIX, async () => {
    const path0 = process.env.PATH
    process.env.PATH = '/nonexistent'
    try {
        await assert.rejects(sender({ script: 'echo x' }).send('c', ALARM), /the interpreter 'sh' is not available on this host \(sh was not found in PATH\)/)
    }
    finally { process.env.PATH = path0 }
})

test('the temporary directory is gone after a run — after a failure too', NOT_UNIX, async () => {
    const ok = await sender({ stdin: EScriptStdin.NONE, script: 'pwd' }).send('c', ALARM)
    const okDir = ok.stdout.trim()
    assert.match(path.basename(okDir), /^kwirth-script-/)
    assert.equal(fs.existsSync(okDir), false)

    const dir = scratch()
    const where = path.join(dir, 'where')
    try {
        await assert.rejects(sender({ stdin: EScriptStdin.NONE, script: `pwd > "${where}"; exit 1` }).send('c', ALARM))
        assert.equal(fs.existsSync(fs.readFileSync(where, 'utf8').trim()), false)
    }
    finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('a long output keeps its end and says it was cut', NOT_UNIX, async () => {
    const r = await sender({ stdin: EScriptStdin.NONE, script: 'i=0; while [ $i -lt 2000 ]; do echo "line $i"; i=$((i+1)); done' }).send('c', ALARM)
    assert.equal(r.truncated, true)
    assert.ok(r.stdout.length <= 8 * 1024)
    assert.ok(r.stdout.endsWith('line 1999\n'))
})

// ─── wait = off ──────────────────────────────────────────────────────────────

const quiet = (): { errors: string[], logger: IExtensionLogger } => {
    const errors: string[] = []
    return { errors, logger: { info: () => {}, trace: () => {}, warning: () => {}, error: m => errors.push(String(m)) } }
}

test('wait=off: the delivery returns as soon as the script STARTS, and the script goes on', NOT_UNIX, async () => {
    const dir = scratch()
    const out = path.join(dir, 'out')
    try {
        const started = Date.now()
        const r = await configured({ wait: false, script: `sleep 1; cat > "${out}"` }).send('c', ALARM) as IScriptStartResult
        assert.ok(Date.now() - started < 800, 'it waited for the script')
        assert.equal(r.started, true)
        assert.ok(pidOf(r) > 0)
        assert.equal(r.host, undefined)
        assert.equal(fs.existsSync(out), false, 'the script cannot have finished yet')
        await until('the script writes its output', () => fs.existsSync(out) && fs.readFileSync(out, 'utf8') === ALARM.body)
    }
    finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('wait=off: a failure after the start does not fail the delivery — it reaches the log', NOT_UNIX, async () => {
    const { errors, logger } = quiet()
    const r = await configured({ wait: false, script: 'echo "webhook answered 401" >&2; exit 3' }, logger).send('c', ALARM) as IScriptStartResult
    assert.equal(r.started, true)
    await until('the error is logged', () => errors.length === 1)
    assert.match(errors[0], new RegExp(`config 'c': background run ${r.pid}: the script exited with code 3: webhook answered 401`))
})

test('wait=off: what is known at start — a missing interpreter — still fails the delivery', NOT_UNIX, async () => {
    const path0 = process.env.PATH
    process.env.PATH = '/nonexistent'
    try {
        await assert.rejects(configured({ wait: false, script: 'echo x' }).send('c', ALARM), /the interpreter 'sh' is not available on this host/)
    }
    finally { process.env.PATH = path0 }
})

test('wait=off: the timeout still kills the script, and says so in the log', NOT_UNIX, async () => {
    const { errors, logger } = quiet()
    const r = await configured({ wait: false, timeoutSeconds: 1, script: 'sleep 30' }, logger).send('c', ALARM) as IScriptStartResult
    await until('the timeout is logged', () => errors.length === 1, 4000)
    assert.match(errors[0], /did not finish within 1 s and was killed/)
    assert.equal(alive(pidOf(r)), false)
})

test('wait=off: the temporary directory is gone once the script ends', NOT_UNIX, async () => {
    const dir = scratch()
    const where = path.join(dir, 'where')
    try {
        await configured({ wait: false, stdin: EScriptStdin.NONE, script: `pwd > "${where}"` }).send('c', ALARM)
        await until('the script ran', () => fs.existsSync(where) && fs.readFileSync(where, 'utf8').trim() !== '')
        const tmp = fs.readFileSync(where, 'utf8').trim()
        await until('its temporary directory is removed', () => !fs.existsSync(tmp))
    }
    finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test(`wait=off: past ${MAX_BACKGROUND_RUNS} runs still going, the delivery fails instead of drowning the pod — and stop kills them all`, NOT_UNIX, async () => {
    const s = configured({ wait: false, stdin: EScriptStdin.NONE, timeoutSeconds: 30, script: 'sleep 30' })
    const pids: number[] = []
    for (let i = 0; i < MAX_BACKGROUND_RUNS; i++) pids.push(pidOf(await s.send('c', ALARM) as IScriptStartResult))
    await assert.rejects(s.send('c', ALARM), new RegExp(`${MAX_BACKGROUND_RUNS} runs of this script are still going in the background`))
    assert.ok(pids.every(alive))

    await s.stopSender()
    await until('every background run is killed', () => pids.every(p => !alive(p)))
})

test('wait=off: a batch is one background run too', NOT_UNIX, async () => {
    const dir = scratch()
    const out = path.join(dir, 'out')
    try {
        const r = await configured({ wait: false, stdin: EScriptStdin.JSON, script: `cat > "${out}"` }).sendBatch('c', [{ body: 'a' }, { body: 'b' }]) as IScriptStartResult
        assert.equal(r.started, true)
        await until('the batch is written', () => fs.existsSync(out) && fs.readFileSync(out, 'utf8').length > 0)
        assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')), [{ body: 'a' }, { body: 'b' }])
    }
    finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

// ─── Windows ─────────────────────────────────────────────────────────────────

test('cmd: the body on stdin and KWIRTH_SUBJECT in the environment', NOT_WINDOWS, async () => {
    const r = await sender({ interpreter: EScriptInterpreter.CMD, script: '@echo off\nmore\necho subject=%KWIRTH_SUBJECT%' }).send('c', { body: 'hello', subject: 'S' })
    assert.match(r.stdout, /hello/)
    assert.match(r.stdout, /subject=S/)
})

test('powershell: the whole message as JSON on stdin', NOT_WINDOWS, async () => {
    const r = await sender({ interpreter: EScriptInterpreter.POWERSHELL, stdin: EScriptStdin.JSON, script: '$m = $input | Out-String | ConvertFrom-Json\nWrite-Output "$($m.level):$env:KWIRTH_SUBJECT"' }).send('c', ALARM)
    assert.equal(r.stdout.trim(), 'error:Pod crashed')
})

test('cmd: a non-zero exit fails the delivery', NOT_WINDOWS, async () => {
    await assert.rejects(sender({ interpreter: EScriptInterpreter.CMD, stdin: EScriptStdin.NONE, script: '@echo off\necho bad 1>&2\nexit /b 4' }).send('c', ALARM), /exited with code 4: bad/)
})
