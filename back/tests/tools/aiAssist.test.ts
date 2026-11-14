import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IConfigAiAssistRequest } from '@kwirthmagnify/kwirth-common'
import { buildAiAssistPrompt, isSecretField, stripFences, validateAiAssistRequest } from '../../src/tools/AiAssist'

// The AI assistant of the configuration forms (plans/sender-script/PRD.md, D10/D11, RF12): what may reach
// the model, what it is told, and how its answer is cleaned.

const baseRequest = (): IConfigAiAssistRequest => ({
    llmId: 'llm-1',
    fieldName: 'script',
    aiInstructions: 'A shell script. The alarm text arrives on stdin.',
    request: 'POST the alarm text to https://hooks.example/alarm',
    fields: [
        { name: 'name', label: 'Name', value: 'alarms' },
        { name: 'interpreter', label: 'Interpreter', type: 'select', value: 'bash' },
        { name: 'script', label: 'Script', type: 'textarea', value: '' },
        { name: 'sshPassword', label: 'SSH password', type: 'password', value: 'S3cr3t-pw' },
        { name: 'sshPrivateKey', label: 'SSH private key', type: 'textarea', secret: true, value: '-----BEGIN OPENSSH PRIVATE KEY-----\nAAAAkey\n-----END OPENSSH PRIVATE KEY-----' },
        { name: 'timeoutSeconds', label: 'Timeout', type: 'number', value: 30 },
    ]
})

test('isSecretField: every password and every field marked secret, nothing else', () => {
    assert.equal(isSecretField({ name: 'a', label: 'a', type: 'password', value: 'x' }), true)
    assert.equal(isSecretField({ name: 'a', label: 'a', type: 'textarea', secret: true, value: 'x' }), true)
    assert.equal(isSecretField({ name: 'a', label: 'a', type: 'text', secret: true, value: 'x' }), true)
    assert.equal(isSecretField({ name: 'a', label: 'a', type: 'textarea', value: 'x' }), false)
    assert.equal(isSecretField({ name: 'a', label: 'a', value: 'x' }), false)
    assert.equal(isSecretField({ name: 'a', label: 'a', type: 'textarea', secret: false, value: 'x' }), false)
})

test('the prompt never carries a secret value, even when the front sent it', () => {
    const { system, prompt } = buildAiAssistPrompt(baseRequest())
    const all = system + '\n' + prompt
    assert.ok(!all.includes('S3cr3t-pw'), 'the password reached the prompt')
    assert.ok(!all.includes('AAAAkey'), 'the private key reached the prompt')
    assert.ok(!all.includes('BEGIN OPENSSH'), 'the private key reached the prompt')
    assert.ok(!all.includes('sshPassword'), 'even the secret field name should not be listed')
})

test('the prompt carries the extension instructions, the other non-secret fields and the request', () => {
    const { system, prompt } = buildAiAssistPrompt(baseRequest())
    assert.ok(system.includes('A shell script. The alarm text arrives on stdin.'))
    assert.ok(system.includes('no code fences'))
    assert.ok(prompt.includes('- Interpreter (interpreter): bash'))
    assert.ok(prompt.includes('- Name (name): alarms'))
    assert.ok(prompt.includes('- Timeout (timeoutSeconds): 30'))
    assert.ok(prompt.includes('POST the alarm text to https://hooks.example/alarm'))
    // the field being drafted is not listed among "the other fields"
    assert.ok(!prompt.includes('- Script (script)'))
})

test('an empty current value is not offered as a starting point; a non-empty one is, verbatim', () => {
    assert.ok(!buildAiAssistPrompt(baseRequest()).prompt.includes('currently holds this value'))

    const req = baseRequest()
    const current = 'echo "C:\\temp\\new.txt"\n\tprintf "a\\n"'
    req.fields = req.fields.map(f => f.name === 'script' ? { ...f, value: current } : f)
    const { prompt } = buildAiAssistPrompt(req)
    assert.ok(prompt.includes('currently holds this value'))
    assert.ok(prompt.includes(current), 'backslashes, tabs and line breaks must reach the model untouched')
})

test('a SECRET field being drafted does not show its current value to the model', () => {
    const req = baseRequest()
    req.fieldName = 'sshPrivateKey'
    const { prompt } = buildAiAssistPrompt(req)
    assert.ok(!prompt.includes('AAAAkey'))
    assert.ok(!prompt.includes('currently holds this value'))
})

test('stripFences: removes a fence enclosing the whole answer, with or without a language', () => {
    assert.equal(stripFences('```\necho hi\n```'), 'echo hi')
    assert.equal(stripFences('```sh\n#!/bin/sh\ncurl -d "$KWIRTH_BODY" x\n```'), '#!/bin/sh\ncurl -d "$KWIRTH_BODY" x')
    assert.equal(stripFences('  ```powershell\nWrite-Output 1\n```  \n'), 'Write-Output 1')
})

test('stripFences: leaves an unfenced answer and inner fences alone', () => {
    assert.equal(stripFences('echo hi\n'), 'echo hi')
    const inner = 'cat <<EOF\n```\nnot a fence of the answer\n```\nEOF'
    assert.equal(stripFences(inner), inner)
})

test('validateAiAssistRequest: names the first missing piece', () => {
    assert.equal(validateAiAssistRequest(baseRequest()), undefined)
    assert.equal(validateAiAssistRequest(undefined), 'missing request body')
    assert.equal(validateAiAssistRequest({ ...baseRequest(), llmId: ' ' }), 'missing llmId')
    assert.equal(validateAiAssistRequest({ ...baseRequest(), fieldName: '' }), 'missing fieldName')
    assert.equal(validateAiAssistRequest({ ...baseRequest(), aiInstructions: '' }), 'the field has no aiInstructions')
    assert.equal(validateAiAssistRequest({ ...baseRequest(), request: '\n' }), 'missing request')
    const sinCampos = { ...baseRequest() } as Partial<IConfigAiAssistRequest>
    delete sinCampos.fields
    assert.equal(validateAiAssistRequest(sinCampos as IConfigAiAssistRequest), 'missing fields')
})
