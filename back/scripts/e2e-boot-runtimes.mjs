/*
    e2e · the core BOOTS on each serverless container platform, with the real process (ts-node src/index.ts).

        npm run e2e:boot

    Each case starts the back on its own port with a throw-away store and NO kubeconfig (KUBECONFIG points at a
    path that does not exist, so it is a real "no Kubernetes" boot even on a machine that has one), sets the
    variables that platform would set, and checks what an orchestrator would check:
      - the detected execution environment in the log,
      - GET /healthz = 200 and GET /front/ = 200,
      - clusterType 'none'.
    The last case is the regression of the old behaviour: with no signal at all, the core still refuses to
    start ('Unsupported execution environment') — on a machine where 169.254.169.254 does not answer as Azure.

    It does not touch the dev instance: different port, its own store, and every process is killed at the end.
*/
import { spawn } from 'child_process'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const backDir = path.join(here, '..')
const PORT = Number(process.env.E2E_BOOT_PORT ?? 13883)
const BOOT_TIMEOUT_MS = 150_000

const CASES = [
    { name: 'Cloud Run', env: { K_SERVICE: 'kwirth' }, expect: { environment: 'cloudrun', clusterName: 'inCloudRun', boots: true } },
    { name: 'ACI', env: { FORCE: 'aci' }, expect: { environment: 'aci', clusterName: 'inAci', boots: true } },
    { name: 'ECS (regression)', env: { ECS_CONTAINER_METADATA_URI_V4: 'http://169.254.170.2/v4/e2e' }, expect: { environment: 'ecs', clusterName: 'inEcs', boots: true } },
    { name: 'no signal (regression)', env: {}, expect: { boots: false } }
]

const PLATFORM_VARS = ['KUBERNETES_SERVICE_HOST', 'ECS_CONTAINER_METADATA_URI_V4', 'ECS_CONTAINER_METADATA_URI', 'K_SERVICE', 'FORCE', 'KWIRTH_CLUSTER_NAME']

const sleep = ms => new Promise(r => setTimeout(r, ms))

const status = async (url) => {
    try { return (await fetch(url, { signal: AbortSignal.timeout(2000) })).status }
    catch { return 0 }
}

const runCase = async (c) => {
    const store = mkdtempSync(path.join(tmpdir(), 'kwirth-e2e-boot-'))
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
    rmSync(store, { recursive: true, force: true })

    const failures = []
    if (c.expect.boots) {
        if (!log.includes(`Execution environment: '${c.expect.environment}'`)) failures.push(`environment '${c.expect.environment}' not detected`)
        if (healthz !== 200) failures.push(`/healthz = ${healthz}`)
        if (front !== 200) failures.push(`/front/ = ${front}`)
        if (!log.includes('"clusterType":"none"')) failures.push(`clusterType is not 'none'`)
        if (!log.includes(`"clusterName":"${c.expect.clusterName}"`)) failures.push(`clusterName is not '${c.expect.clusterName}'`)
    }
    else {
        if (!log.includes('Unsupported execution environment')) failures.push('expected the core to refuse to start with no signal')
        if (healthz === 200) failures.push('it booted, but with no signal it must not')
    }
    return { name: c.name, ok: failures.length === 0, failures, log }
}

let failed = 0
for (const c of CASES) {
    const r = await runCase(c)
    console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.ok ? '' : ` — ${r.failures.join('; ')}`}`)
    if (!r.ok) {
        failed++
        console.log(r.log.split('\n').filter(l => /environment|capabilities|Unsupported|Exiting|Error/i.test(l)).slice(0, 12).join('\n'))
    }
}
console.log(`\n${CASES.length - failed}/${CASES.length} passed`)
process.exit(failed ? 1 : 0)
