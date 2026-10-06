/*
    e2e · the core BOOTS on each serverless container platform, with the real process (ts-node src/index.ts),
    and gives itself an INSTALLATION IDENTITY there (serverless-runtimes S1 + S2).

        npm run e2e:boot

    Each case starts the back on its own port with a throw-away store and NO kubeconfig (KUBECONFIG points at a
    path that does not exist, so it is a real "no Kubernetes" boot even on a machine that has one), sets the
    variables that platform would set, and checks what an orchestrator would check:
      - the detected execution environment in the log,
      - GET /healthz = 200 and GET /front/ = 200,
      - clusterType 'none',
      - the installation identity printed at startup.

    Identity, per platform:
      - ECS: a FAKE task metadata endpoint is served here and ECS_CONTAINER_METADATA_URI_V4 points at it, so the
        real code path (metadata → aws:ecs:<account>:<region>:<cluster>:<family>) runs end to end.
      - Cloud Run and ACI: their metadata endpoints live at fixed addresses (metadata.google.internal,
        169.254.169.254) that cannot be faked without touching this machine's network, so here they prove the
        CONTROLLED fallback — a generated 'uuid:' id and the reason in the log. Extracting the real identity
        from each platform is covered by the unit tests (installationIdentity.test.ts).
      - Restart: two boots on the SAME store must print the SAME generated id.
    The last case is the regression of the old behaviour: with no signal at all the core still refuses to start
    — on a machine where 169.254.169.254 does not answer as Azure.

    It does not touch the dev instance: different ports, its own store, and every process is killed at the end.
*/
import { spawn } from 'child_process'
import { createServer } from 'http'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const backDir = path.join(here, '..')
const PORT = Number(process.env.E2E_BOOT_PORT ?? 13883)
const ECS_METADATA_PORT = PORT + 1
const BOOT_TIMEOUT_MS = 150_000

// The fake ECS task metadata endpoint: what the ECS agent answers at ${ECS_CONTAINER_METADATA_URI_V4}/task.
const ECS_TASK = {
    Cluster: 'arn:aws:ecs:eu-west-1:123456789012:cluster/e2e-cluster',
    TaskARN: 'arn:aws:ecs:eu-west-1:123456789012:task/e2e-cluster/0123456789abcdef',
    Family: 'kwirth-e2e'
}
const ecsMetadata = createServer((req, res) => {
    if (req.url === '/v4/e2e/task') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(ECS_TASK)); return }
    res.writeHead(404); res.end()
})

const UUID_ID = /^uuid:[0-9a-f-]{36}$/

const CASES = [
    { name: 'Cloud Run (fallback identity)', env: { K_SERVICE: 'kwirth' }, expect: { environment: 'cloudrun', clusterName: 'inCloudRun', boots: true, identity: UUID_ID, logs: ['cloudrun platform gave none'] } },
    { name: 'ACI (fallback identity)', env: { FORCE: 'aci' }, expect: { environment: 'aci', clusterName: 'inAci', boots: true, identity: UUID_ID, logs: ['aci platform gave none'] } },
    { name: 'ECS (identity from task metadata)', env: { ECS_CONTAINER_METADATA_URI_V4: `http://127.0.0.1:${ECS_METADATA_PORT}/v4/e2e` }, expect: { environment: 'ecs', clusterName: 'inEcs', boots: true, identity: 'aws:ecs:123456789012:eu-west-1:e2e-cluster:kwirth-e2e', logs: ['from ecs'] } },
    { name: 'restart keeps the generated identity (1/2)', env: { FORCE: 'aci' }, store: 'shared', expect: { environment: 'aci', clusterName: 'inAci', boots: true, identity: UUID_ID, logs: [], remember: true } },
    { name: 'restart keeps the generated identity (2/2)', env: { FORCE: 'aci' }, store: 'shared', expect: { environment: 'aci', clusterName: 'inAci', boots: true, identity: 'remembered', logs: [] } },
    { name: 'no signal (regression)', env: {}, expect: { boots: false } }
]

const PLATFORM_VARS = ['KUBERNETES_SERVICE_HOST', 'ECS_CONTAINER_METADATA_URI_V4', 'ECS_CONTAINER_METADATA_URI', 'K_SERVICE', 'FORCE', 'KWIRTH_CLUSTER_NAME']

const sleep = ms => new Promise(r => setTimeout(r, ms))

const status = async (url) => {
    try { return (await fetch(url, { signal: AbortSignal.timeout(2000) })).status }
    catch { return 0 }
}

const stores = {}
let remembered

const runCase = async (c) => {
    const shared = c.store !== undefined
    const store = shared ? (stores[c.store] ??= mkdtempSync(path.join(tmpdir(), 'kwirth-e2e-boot-'))) : mkdtempSync(path.join(tmpdir(), 'kwirth-e2e-boot-'))
    const env = { ...process.env }
    for (const k of PLATFORM_VARS) delete env[k]
    Object.assign(env, { PORT: String(PORT), KWIRTH_STORE: store, KUBECONFIG: path.join(store, 'no-such-kubeconfig') }, c.env)

    const child = spawn(process.execPath, ['--max-old-space-size=2048', 'node_modules/ts-node/dist/bin.js', 'src/index.ts'], { cwd: backDir, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let log = ''
    child.stdout.on('data', d => { log += d })
    child.stderr.on('data', d => { log += d })
    let exited = false
    child.on('exit', () => { exited = true })

    let healthz = 0
    const deadline = Date.now() + BOOT_TIMEOUT_MS
    while (Date.now() < deadline && !exited) {
        healthz = await status(`http://127.0.0.1:${PORT}/healthz`)
        if (healthz === 200) break
        await sleep(2000)
    }
    const front = exited ? 0 : await status(`http://127.0.0.1:${PORT}/front/`)
    if (!exited) child.kill('SIGKILL')
    await sleep(500)
    if (!shared) rmSync(store, { recursive: true, force: true })

    const failures = []
    const identity = /Installation identity: '([^']+)'/.exec(log)?.[1]
    if (c.expect.boots) {
        if (!log.includes(`Execution environment: '${c.expect.environment}'`)) failures.push(`environment '${c.expect.environment}' not detected`)
        if (healthz !== 200) failures.push(`/healthz = ${healthz}`)
        if (front !== 200) failures.push(`/front/ = ${front}`)
        if (!log.includes('"clusterType":"none"')) failures.push(`clusterType is not 'none'`)
        if (!log.includes(`"clusterName":"${c.expect.clusterName}"`)) failures.push(`clusterName is not '${c.expect.clusterName}'`)
        const want = c.expect.identity === 'remembered' ? remembered : c.expect.identity
        if (!identity) failures.push('no installation identity in the log')
        else if (want instanceof RegExp ? !want.test(identity) : identity !== want) failures.push(`identity '${identity}', expected ${want}`)
        for (const l of c.expect.logs) if (!log.includes(l)) failures.push(`log lacks '${l}'`)
        if (c.expect.remember) remembered = identity
    }
    else {
        if (!log.includes('Unsupported execution environment')) failures.push('expected the core to refuse to start with no signal')
        if (healthz === 200) failures.push('it booted, but with no signal it must not')
    }
    return { name: c.name, ok: failures.length === 0, failures, log, identity }
}

await new Promise(r => ecsMetadata.listen(ECS_METADATA_PORT, '127.0.0.1', r))
let failed = 0
try {
    for (const c of CASES) {
        const r = await runCase(c)
        console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.identity ? `  [${r.identity}]` : ''}${r.ok ? '' : ` — ${r.failures.join('; ')}`}`)
        if (!r.ok) {
            failed++
            console.log(r.log.split('\n').filter(l => /environment|identity|capabilities|Unsupported|Exiting|Error/i.test(l)).slice(0, 12).join('\n'))
        }
    }
}
finally {
    ecsMetadata.close()
    for (const s of Object.values(stores)) rmSync(s, { recursive: true, force: true })
}
console.log(`\n${CASES.length - failed}/${CASES.length} passed`)
process.exit(failed ? 1 : 0)
