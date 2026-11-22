// S1: toolset contract and registry. Runs against the compiled dist (build first), like agent.test.mjs.
//
// What this pins down is not "that the functions do not blow up", but the three invariants the plan
// (plans/ai-tools/PLAN.md) flags as expensive to fix late: a single registration door, reserved built-in
// ids, and tool references ALWAYS qualified.

import test from 'node:test'
import assert from 'node:assert/strict'
import back from '../dist/back.js'
import * as iso from '../dist/index.js'

const {
    registerToolset, unregisterToolset, getToolset, listToolsets, listToolsetInfos,
    resolveToolRef, isBuiltInToolsetId, buildToolHost, invokeToolRef
} = back
const { toolRef, parseToolRef, EToolEffect, EToolSensitivity, ECapability } = iso

const fakeTool = (name, over = {}) => ({
    name,
    description: `tool ${name}`,
    effect: EToolEffect.READ,
    sensitivity: EToolSensitivity.PUBLIC,
    inputSchema: {},
    execute: async () => 'ok',
    ...over
})

const fakeToolset = (id, tools = ['alpha'], over = {}) => ({
    id,
    version: '0.0.1',
    displayName: id,
    description: `toolset ${id}`,
    requires: [ECapability.K8S],
    tools: tools.map(t => fakeTool(t)),
    ...over
})

// ── referencias cualificadas ─────────────────────────────────────────────────────────────────────────

test('una referencia de tool se construye y se parsea cualificada', () => {
    const ref = toolRef('k8s-inventory', 'list_namespaces')
    assert.equal(ref, 'k8s-inventory/list_namespaces')
    assert.deepEqual(parseToolRef(ref), { toolsetId: 'k8s-inventory', toolName: 'list_namespaces' })
})

test('un nombre a secas NO es una referencia valida', () => {
    // This is the invariant that avoids ambiguity the day two toolsets both bring a 'get_pod_logs'
    assert.equal(parseToolRef('list_namespaces'), undefined)
    assert.equal(parseToolRef(''), undefined)
    assert.equal(parseToolRef('/list_namespaces'), undefined)
    assert.equal(parseToolRef('k8s-inventory/'), undefined)
})

test('el nombre de la tool puede llevar separadores; el toolset es lo que va delante del primero', () => {
    assert.deepEqual(parseToolRef('ts/a/b'), { toolsetId: 'ts', toolName: 'a/b' })
})

// ── registro ─────────────────────────────────────────────────────────────────────────────────────────

test('un toolset registrado se encuentra y aparece listado', () => {
    registerToolset(fakeToolset('reg-basic'))
    assert.equal(getToolset('reg-basic')?.id, 'reg-basic')
    assert.ok(listToolsets().some(t => t.id === 'reg-basic'))
    unregisterToolset('reg-basic')
})

test('registrar dos veces el mismo id revienta en vez de pisar al primero', () => {
    registerToolset(fakeToolset('reg-dup'))
    assert.throws(() => registerToolset(fakeToolset('reg-dup')), /already registered/)
    unregisterToolset('reg-dup')
})

test('un toolset de tercero NO puede ocupar el id de un built-in', () => {
    registerToolset(fakeToolset('reg-builtin'), true)
    assert.equal(isBuiltInToolsetId('reg-builtin'), true)
    assert.throws(() => registerToolset(fakeToolset('reg-builtin')), /reserved/)
})

test('un built-in no se puede retirar; uno instalado si', () => {
    // 'reg-builtin' is still registered from the previous test: removing it must fail and leave it in place
    assert.equal(unregisterToolset('reg-builtin'), false)
    assert.ok(getToolset('reg-builtin'))

    registerToolset(fakeToolset('reg-removable'))
    assert.equal(unregisterToolset('reg-removable'), true)
    assert.equal(getToolset('reg-removable'), undefined)
})

// ── resolucion ───────────────────────────────────────────────────────────────────────────────────────

test('resolveToolRef encuentra toolset y tool, y falla entero si cualquiera de los dos no esta', () => {
    registerToolset(fakeToolset('reg-resolve', ['alpha', 'beta']))

    const found = resolveToolRef('reg-resolve/beta')
    assert.equal(found?.toolset.id, 'reg-resolve')
    assert.equal(found?.tool.name, 'beta')

    assert.equal(resolveToolRef('reg-resolve/no-existe'), undefined)
    assert.equal(resolveToolRef('no-existe/beta'), undefined)
    assert.equal(resolveToolRef('beta'), undefined)   // sin cualificar, no resuelve

    unregisterToolset('reg-resolve')
})

// ── what travels to the front end ────────────────────────────────────────────────────────────────────

test('las fichas que van al front NO llevan execute ni inputSchema', () => {
    // The front end needs to decide (show, group, flag), not execute. If execute slipped through, we would
    // be shipping back-end code inside an HTTP response.
    registerToolset(fakeToolset('reg-info', ['alpha']))

    const info = listToolsetInfos().find(t => t.id === 'reg-info')
    assert.ok(info)
    assert.deepEqual(Object.keys(info).sort(), ['description', 'displayName', 'id', 'requires', 'tools', 'version'])
    assert.deepEqual(Object.keys(info.tools[0]).sort(), ['description', 'effect', 'name', 'sensitivity'])

    unregisterToolset('reg-info')
})

// ── reparto de capabilities ──────────────────────────────────────────────────────────────────────────
//
// The ECapability promise is "the host gives what was declared and NOTHING ELSE". It is checked for real
// because it is an easy promise to break without noticing: all it takes is someone assembling the host by
// hand elsewhere and being generous. The day a toolset declaring nothing receives a cluster, these fail.

const fakeContext = (over = {}) => ({
    origin: 'test',
    nodes: new Map([['n1', { name: 'n1', ip: '10.0.0.1', maxPods: 110 }]]),
    clusterInfo: {
        name: 'k3d-test', flavour: 'k3d', vcpus: 4, memory: 8 * 1024 * 1024 * 1024,
        coreApi: { listNamespace: async () => ({ items: [] }) },
        appsApi: {}, networkApi: {},
        saToken: 'NO-DEBE-SALIR', token: 'NO-DEBE-SALIR', senders: {}, webhooks: {}
    },
    clusterMetrics: [{ cpu: 1 }],
    clusterEvents: [{ type: 'ADDED' }],
    sourceRepos: [{ host: 'github.com', token: 'x' }],
    trace: () => {},
    ...over
})

test('solo se provisiona lo declarado en requires', () => {
    const ctx = fakeContext()

    const solo = buildToolHost([], ctx)
    assert.deepEqual(Object.keys(solo), ['trace', 'config'])   // trace y config SIEMPRE (no son capacidades), y nada mas

    const k8s = buildToolHost([ECapability.K8S], ctx)
    assert.ok(k8s.k8s)
    assert.equal(k8s.metrics, undefined)
    assert.equal(k8s.events, undefined)
    assert.equal(k8s.repos, undefined)

    const todo = buildToolHost([ECapability.K8S, ECapability.METRICS, ECapability.EVENTS, ECapability.REPOS], ctx)
    assert.deepEqual(Object.keys(todo).sort(), ['config', 'events', 'k8s', 'metrics', 'repos', 'trace'])
})

test('la fachada de cluster NO deja pasar las credenciales del core', () => {
    // clusterInfo carries saToken, token, senders and webhooks. A third-party toolset has no business
    // seeing them, and handing over the whole object is exactly the catch-all this contract came to close.
    const host = buildToolHost([ECapability.K8S], fakeContext())
    // The list is exact on purpose: this is the assertion that turns red the day somebody widens the
    // facade, so widening it is always a decision and never a slip. crdApi joined it on 2026-09-28 --
    // without it a toolset cannot read a single CRD, which is where Fleet, Kubewarden and Longhorn live.
    assert.deepEqual(Object.keys(host.k8s).sort(), ['appsApi', 'coreApi', 'crdApi', 'flavour', 'memory', 'name', 'networkApi', 'nodes', 'vcpus'])
    assert.equal(JSON.stringify(host.k8s).includes('NO-DEBE-SALIR'), false)
})

// ── ECapability.PROVIDERS (S1 of the serverless toolsets plan) ──────────────────────────────────────────────
// The toolset names the providers it needs; the host lends ONLY those, asked for on behalf of the consumer the
// tools run for (the channel), so the core's registry and its log of operations attribute them.

const providersContext = (asked) => fakeContext({
    consumer: { id: 'agora' },
    clusterInfo: { ...fakeContext().clusterInfo, getProvider: (id, consumer) => { asked.push({ id, consumer }); return { id, getData: async () => 'data', getOperations: () => [], runOperation: async () => ({ success: true, dryRun: true }) } } }
})

test('PROVIDERS: only the providers the toolset named, asked for on behalf of the consumer', () => {
    const asked = []
    const host = buildToolHost([ECapability.PROVIDERS], providersContext(asked), ['aws'])
    assert.ok(host.providers)
    assert.equal(host.providers.get('aws').id, 'aws')
    assert.equal(host.providers.get('azure'), undefined, 'not named by the toolset: not lent, and not even asked for')
    assert.deepEqual(asked, [{ id: 'aws', consumer: { id: 'agora' } }])
})

test('PROVIDERS: not declared, no consumer, or a host without getProvider = no providers at all', () => {
    assert.equal(buildToolHost([ECapability.K8S], providersContext([]), ['aws']).providers, undefined, 'not in requires')
    assert.equal(buildToolHost([ECapability.PROVIDERS], fakeContext({ consumer: undefined }), ['aws']).providers, undefined, 'no consumer to attribute it to')
    assert.equal(buildToolHost([ECapability.PROVIDERS], fakeContext({ consumer: { id: 'agora' } }), ['aws']).providers, undefined, 'clusterInfo without getProvider')
    const none = buildToolHost([ECapability.PROVIDERS], providersContext([]))
    assert.equal(none.providers.get('aws'), undefined, 'declared the capability but named no provider: nothing')
})

test('PROVIDERS: the list goes to the front with the toolset, so the admin sees what it reaches', () => {
    registerToolset({ id: 'reg-prov', version: '0.1.0', displayName: 'P', description: 'p', requires: [ECapability.PROVIDERS], providers: ['aws'], tools: [] })
    assert.deepEqual(listToolsetInfos().find(t => t.id === 'reg-prov').providers, ['aws'])
    unregisterToolset('reg-prov')
})

test('sin cluster no se inventa la capability aunque se declare', () => {
    // Better the tool receives undefined and says so, than handing it a half-built facade that blows up inside.
    const host = buildToolHost([ECapability.K8S], fakeContext({ clusterInfo: undefined }))
    assert.equal(host.k8s, undefined)
    assert.equal(typeof host.trace, 'function')
})

test('invocar por referencia construye el host del toolset que la trae', async () => {
    let visto
    registerToolset({
        ...fakeToolset('inv-caps', []),
        requires: [ECapability.METRICS],
        tools: [{ ...fakeTool('peek'), execute: async (args, host) => { visto = host; return args.n } }]
    })

    const res = await invokeToolRef('inv-caps/peek', { n: 7 }, fakeContext())
    assert.equal(res, 7)
    assert.ok(visto.metrics)
    assert.equal(visto.k8s, undefined)   // no lo declaro: no lo recibe

    unregisterToolset('inv-caps')
})

test('invocar una referencia que no existe falla con el ref completo', async () => {
    await assert.rejects(() => invokeToolRef('no-existe/nada', {}, fakeContext()), /no-existe\/nada/)
})

// ── settings: host.config (plans/extension-config, S8) ───────────────────────────────────────────────

test('🔴 a toolset with no settings gives its tools config = {}, always present', async () => {
    let visto
    registerToolset({ ...fakeToolset('cfg-none', []), requires: [], tools: [{ ...fakeTool('peek'), execute: async (args, host) => { visto = host } }] })
    await invokeToolRef('cfg-none/peek', {}, fakeContext())
    assert.deepEqual(visto.config, {})
    unregisterToolset('cfg-none')
})

test('🔴 what the core sets reaches the NEXT invocation, without registering it again', async () => {
    const vistos = []
    registerToolset({ ...fakeToolset('cfg-live', []), requires: [], tools: [{ ...fakeTool('peek'), execute: async (args, host) => { vistos.push(host.config) } }] })
    back.setToolsetConfig('cfg-live', { namespace: 'apps', dryRun: true })
    await invokeToolRef('cfg-live/peek', {}, fakeContext())
    back.setToolsetConfig('cfg-live', { namespace: 'prod', dryRun: false })
    await invokeToolRef('cfg-live/peek', {}, fakeContext())
    assert.deepEqual(vistos, [{ namespace: 'apps', dryRun: true }, { namespace: 'prod', dryRun: false }])
    unregisterToolset('cfg-live')
})

test('a tool cannot change the settings the next one sees: it receives a copy', async () => {
    registerToolset({ ...fakeToolset('cfg-copy', []), requires: [], tools: [{ ...fakeTool('mess'), execute: async (args, host) => { host.config.namespace = 'hacked' } }] })
    back.setToolsetConfig('cfg-copy', { namespace: 'apps' })
    await invokeToolRef('cfg-copy/mess', {}, fakeContext())
    assert.deepEqual(back.getToolsetConfig('cfg-copy'), { namespace: 'apps' })
    unregisterToolset('cfg-copy')
})

test('undefined removes the settings, and so does unregistering the toolset', () => {
    registerToolset(fakeToolset('cfg-gone', []))
    back.setToolsetConfig('cfg-gone', { a: 1 })
    back.setToolsetConfig('cfg-gone', undefined)
    assert.deepEqual(back.getToolsetConfig('cfg-gone'), {})
    back.setToolsetConfig('cfg-gone', { a: 1 })
    unregisterToolset('cfg-gone')
    assert.deepEqual(back.getToolsetConfig('cfg-gone'), {})
})

// ── EXEC (plans/toolset-exec, E1) ────────────────────────────────────────────────────────────────────

/*
    A fake of @kubernetes/client-node's Exec: like the real one, it writes the output to the streams it is
    given, reads the stdin stream, calls the status callback, and resolves a socket whose 'close' comes last.
    `behave` decides what the remote command does.
*/
const fakeExecApi = (behave) => {
    const calls = []
    return {
        calls,
        exec: async (ns, pod, container, command, stdout, stderr, stdin, tty, onStatus) => {
            if (behave.refuse) throw Object.assign(new Error('forbidden'), { code: 403 })
            let input = ''
            if (stdin) for await (const chunk of stdin) input += chunk.toString()
            calls.push({ ns, pod, container, command, tty, input })
            const listeners = []
            const socket = { on: (ev, fn) => { if (ev === 'close') listeners.push(fn) }, close: () => listeners.forEach(f => f()) }
            if (!behave.hang) {
                setImmediate(() => {
                    if (behave.stdout) stdout.write(behave.stdout(input))
                    if (behave.stderr) stderr.write(behave.stderr)
                    onStatus(behave.exitCode ? { status: 'Failure', reason: 'NonZeroExitCode', details: { causes: [{ reason: 'ExitCode', message: String(behave.exitCode) }] } } : { status: 'Success' })
                    listeners.forEach(f => f())
                })
            }
            return socket
        }
    }
}

const execContext = (execApi, traced = []) => fakeContext({ clusterInfo: { ...fakeContext().clusterInfo, execApi }, trace: (t, a) => traced.push({ t, a }), consumer: 'agora' })

test('🔴 EXEC: not declared, no host.exec — declared but no execApi, none either', () => {
    assert.equal(buildToolHost([ECapability.K8S], execContext(fakeExecApi({}))).exec, undefined)
    assert.equal(buildToolHost([ECapability.EXEC], fakeContext()).exec, undefined)
    assert.equal(typeof buildToolHost([ECapability.EXEC], execContext(fakeExecApi({}))).exec.run, 'function')
})

test('🔴 EXEC: runs the array command with its stdin, and returns output and exit code', async () => {
    const api = fakeExecApi({ stdout: (input) => `got:${input}` })
    const host = buildToolHost([ECapability.EXEC], execContext(api))
    const r = await host.exec.run('demo', 'web-1', 'nginx', ['sh', '-c', 'cat > "$1"', 'sh', '/tmp/x'], { stdin: 'hello' })
    assert.deepEqual(r, { exitCode: 0, stdout: 'got:hello', stderr: '', truncated: false, timedOut: false })
    assert.deepEqual(api.calls[0], { ns: 'demo', pod: 'web-1', container: 'nginx', command: ['sh', '-c', 'cat > "$1"', 'sh', '/tmp/x'], tty: false, input: 'hello' })
})

test('EXEC: a non-zero exit code comes back as the command\'s own, with its stderr', async () => {
    const host = buildToolHost([ECapability.EXEC], execContext(fakeExecApi({ stderr: 'sh: not found', exitCode: 127 })))
    const r = await host.exec.run('demo', 'p', 'c', ['nope'])
    assert.equal(r.exitCode, 127)
    assert.equal(r.stderr, 'sh: not found')
})

test('🔴 EXEC: a failure that is not an exit code (no such binary, distroless) keeps the API\'s reason in stderr', async () => {
    const api = {
        exec: async (ns, pod, c, cmd, stdout, stderr, stdin, tty, onStatus) => {
            const listeners = []
            setImmediate(() => { onStatus({ status: 'Failure', reason: 'InternalError', message: 'exec: "nope": executable file not found in $PATH' }); listeners.forEach(f => f()) })
            return { on: (ev, fn) => listeners.push(fn), close: () => {} }
        }
    }
    const r = await buildToolHost([ECapability.EXEC], execContext(api)).exec.run('demo', 'p', 'c', ['nope'])
    assert.equal(r.exitCode, 1)
    assert.match(r.stderr, /executable file not found/)
})

test('🔴 EXEC: output past the core\'s cap (1 MB, stdout + stderr) is cut and said', async () => {
    const big = 'x'.repeat(back.EXEC_MAX_OUTPUT_BYTES + 10)
    const host = buildToolHost([ECapability.EXEC], execContext(fakeExecApi({ stdout: () => big, stderr: 'more' })))
    const r = await host.exec.run('demo', 'p', 'c', ['cat', 'big'])
    assert.equal(r.truncated, true)
    assert.equal(r.stdout.length + r.stderr.length, back.EXEC_MAX_OUTPUT_BYTES)
})

test('🔴 EXEC: a command that hangs is cut at its timeout, capped by the core at 120 s', async () => {
    const host = buildToolHost([ECapability.EXEC], execContext(fakeExecApi({ hang: true })))
    const started = Date.now()
    const r = await host.exec.run('demo', 'p', 'c', ['sleep', '999'], { timeoutSeconds: 1 })
    assert.equal(r.timedOut, true)
    assert.equal(r.exitCode, -1)
    assert.ok(Date.now() - started < 3000)
    assert.equal(back.EXEC_MAX_TIMEOUT_SECONDS, 120)
    assert.equal(back.EXEC_DEFAULT_TIMEOUT_SECONDS, 30)
})

test('🔴 EXEC: an API refusal (403, no pods/exec) is THROWN with its code, for the tool to say it', async () => {
    const host = buildToolHost([ECapability.EXEC], execContext(fakeExecApi({ refuse: true })))
    await assert.rejects(host.exec.run('demo', 'p', 'c', ['ls']), (err) => err.code === 403)
})

test('🔴 EXEC: every run is traced with pod, container, command and consumer — never the stdin', async () => {
    const traced = []
    const host = buildToolHost([ECapability.EXEC], execContext(fakeExecApi({}), traced))
    await host.exec.run('demo', 'web-1', 'nginx', ['sh', '-c', 'cat > "$1"', 'sh', '/etc/app.conf'], { stdin: 'password=s3cr3t' })
    assert.deepEqual(traced, [{ t: 'exec', a: { namespace: 'demo', pod: 'web-1', container: 'nginx', command: ['sh', '-c', 'cat > "$1"', 'sh', '/etc/app.conf'], stdinBytes: 15, consumer: 'agora' } }])
    assert.equal(JSON.stringify(traced).includes('s3cr3t'), false)
})

test('the descriptor sent to the front carries the configSchema, and none when not declared', () => {
    const schema = [{ name: 'namespace', label: 'Namespace', default: 'default' }]
    registerToolset({ ...fakeToolset('cfg-schema', []), configSchema: schema })
    registerToolset(fakeToolset('cfg-noschema', []))
    assert.deepEqual(listToolsetInfos().find(t => t.id === 'cfg-schema').configSchema, schema)
    assert.equal('configSchema' in listToolsetInfos().find(t => t.id === 'cfg-noschema'), false)
    unregisterToolset('cfg-schema')
    unregisterToolset('cfg-noschema')
})
