import test from 'node:test'
import assert from 'node:assert/strict'
import { ISenderMessage } from '@kwirthmagnify/kwirth-common-back'
import { EScriptInterpreter, EScriptStdin } from '../src/back/types'
import { cleanEnv, commandLine, kwirthEnv, OutputTail, scriptContent, scriptExtension, stdinPayload, INHERITED_LINUX } from '../src/back/build'

// What a run is made of, decided without running anything — so it is tested the same on Linux and Windows.

const ALARM: ISenderMessage = {
    subject: 'Pod crashed',
    body: 'api-1 restarted 5 times\n\tlast exit: 137 — "OOMKilled" C:\\temp\\x',
    to: ['ops@example.com', 'sre@example.com'],
    level: 'error',
    metadata: { rule: 'restarts' },
    origin: { cluster: 'prod', namespace: 'shop', pod: 'api-1', timestamp: 1700000000000 }
}

test('each interpreter gets the extension it requires', () => {
    assert.equal(scriptExtension(EScriptInterpreter.SH), '.sh')
    assert.equal(scriptExtension(EScriptInterpreter.BASH), '.sh')
    assert.equal(scriptExtension(EScriptInterpreter.PWSH), '.ps1')
    assert.equal(scriptExtension(EScriptInterpreter.POWERSHELL), '.ps1')
    assert.equal(scriptExtension(EScriptInterpreter.CMD), '.cmd')
})

test('line ends: LF for the shells (a CR breaks them), CRLF for cmd, untouched otherwise', () => {
    const typed = 'echo a\r\necho b\recho c\n'
    assert.equal(scriptContent(EScriptInterpreter.SH, typed), 'echo a\necho b\necho c\n')
    assert.equal(scriptContent(EScriptInterpreter.BASH, typed), 'echo a\necho b\necho c\n')
    assert.equal(scriptContent(EScriptInterpreter.CMD, typed), 'echo a\r\necho b\r\necho c\r\n')
    assert.equal(scriptContent(EScriptInterpreter.PWSH, 'Write-Output "C:\\t\\n"\n'), 'Write-Output "C:\\t\\n"\n', 'backslashes are never touched')
})

test('the command line of each interpreter is non-interactive and runs the file', () => {
    assert.deepEqual(commandLine(EScriptInterpreter.SH, '/tmp/d/script.sh'), { command: 'sh', args: ['/tmp/d/script.sh'] })
    assert.deepEqual(commandLine(EScriptInterpreter.BASH, '/tmp/d/script.sh'), { command: 'bash', args: ['/tmp/d/script.sh'] })
    assert.deepEqual(commandLine(EScriptInterpreter.PWSH, 'C:\\T\\script.ps1'),
        { command: 'pwsh', args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', 'C:\\T\\script.ps1'] })
    assert.deepEqual(commandLine(EScriptInterpreter.POWERSHELL, 'C:\\T\\script.ps1'),
        { command: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', 'C:\\T\\script.ps1'] })
    assert.deepEqual(commandLine(EScriptInterpreter.CMD, 'C:\\T\\script.cmd'), { command: 'cmd.exe', args: ['/d', '/c', 'C:\\T\\script.cmd'] })
})

test('stdin, single message: nothing, the body verbatim, or the message as a JSON object', () => {
    assert.equal(stdinPayload(EScriptStdin.NONE, [ALARM], false), '')
    assert.equal(stdinPayload(EScriptStdin.TEXT, [ALARM], false), ALARM.body)
    assert.deepEqual(JSON.parse(stdinPayload(EScriptStdin.JSON, [ALARM], false)), ALARM)
})

test('stdin, batch: one body per line, or a JSON ARRAY — even with a single message', () => {
    const second: ISenderMessage = { body: 'second' }
    assert.equal(stdinPayload(EScriptStdin.TEXT, [ALARM, second], true), `${ALARM.body}\nsecond`)
    assert.deepEqual(JSON.parse(stdinPayload(EScriptStdin.JSON, [ALARM, second], true)), [ALARM, second])
    assert.deepEqual(JSON.parse(stdinPayload(EScriptStdin.JSON, [second], true)), [second])
})

test('KWIRTH_* for one message: the five variables, recipients comma-separated', () => {
    assert.deepEqual(kwirthEnv([ALARM], false), {
        KWIRTH_BODY: ALARM.body,
        KWIRTH_SUBJECT: 'Pod crashed',
        KWIRTH_LEVEL: 'error',
        KWIRTH_TO: 'ops@example.com,sre@example.com',
        KWIRTH_MESSAGE: JSON.stringify(ALARM)
    })
    assert.deepEqual(kwirthEnv([{ body: 'x', to: 'one@example.com' }], false),
        { KWIRTH_BODY: 'x', KWIRTH_SUBJECT: '', KWIRTH_LEVEL: '', KWIRTH_TO: 'one@example.com', KWIRTH_MESSAGE: '{"body":"x","to":"one@example.com"}' })
})

test('KWIRTH_* for a batch: only the body lines and the array — no subject or level of "the batch"', () => {
    const env = kwirthEnv([{ body: 'a', subject: 's', level: 'info' }, { body: 'b' }], true)
    assert.deepEqual(Object.keys(env).sort(), ['KWIRTH_BODY', 'KWIRTH_MESSAGE'])
    assert.equal(env.KWIRTH_BODY, 'a\nb')
    assert.deepEqual(JSON.parse(env.KWIRTH_MESSAGE), [{ body: 'a', subject: 's', level: 'info' }, { body: 'b' }])
})

test('🔴 the clean environment drops everything outside the whitelist — credentials included', () => {
    const source = { PATH: '/usr/bin', HOME: '/home/kwirth', LANG: 'C.UTF-8', DB_PASSWORD: 'x', KWIRTH_MASTERKEY: 'y', AWS_SECRET_ACCESS_KEY: 'z' }
    assert.deepEqual(cleanEnv('linux', source), { PATH: '/usr/bin', HOME: '/home/kwirth', LANG: 'C.UTF-8' })
    assert.deepEqual(cleanEnv('linux', source, { KWIRTH_BODY: 'b' }), { PATH: '/usr/bin', HOME: '/home/kwirth', LANG: 'C.UTF-8', KWIRTH_BODY: 'b' })
    assert.ok(!INHERITED_LINUX.some(n => /PASS|SECRET|KEY|TOKEN/.test(n)))
})

test('the clean environment on Windows finds the variables whatever their case', () => {
    const source = { Path: 'C:\\Windows', SystemRoot: 'C:\\Windows', ComSpec: 'C:\\Windows\\cmd.exe', PATHEXT: '.COM;.EXE', SQL_PASSWORD: 'x' }
    assert.deepEqual(cleanEnv('win32', source), { Path: 'C:\\Windows', SystemRoot: 'C:\\Windows', ComSpec: 'C:\\Windows\\cmd.exe', PATHEXT: '.COM;.EXE' })
})

test('the output keeps its END within the limit, and says it was cut', () => {
    const tail = new OutputTail(10)
    tail.push('12345')
    assert.equal(tail.value, '12345')
    assert.equal(tail.truncated, false)
    tail.push('67890ABC')
    assert.equal(tail.value, '4567890ABC')
    assert.equal(tail.truncated, true)
})
