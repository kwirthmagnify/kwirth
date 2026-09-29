/*
    End-to-end run of the Kwirth Helm chart against the CURRENT kube context. It owns a namespace of its own
    (kwirth-helm-e2e) and a release of its own (e2e), creates them, drives them through install, upgrade and
    uninstall, and deletes them at the end. Nothing outside that namespace is touched, except the
    cluster-scoped RBAC of the release (e2e-kwirth-cr / e2e-kwirth-crb), which goes with it.

    What it proves that the unit tests cannot:
      - the image starts and answers under the explicit RBAC list (no cluster-admin)
      - the users Secret the chart bootstraps is the one the core reads: the first login answers 201
        ('change your password'), which only happens when the admin user was found
      - an upgrade re-renders the LIVE users Secret (lookup), so a user added after the install survives
      - uninstall keeps the users Secret and the API keys ConfigMap (resource-policy keep)

    Run:  node deploy/helm/tests/run-e2e.mjs
    Exit code 0 = every check passed. Needs helm and kubectl on the PATH.
*/
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const chartDir = path.resolve(here, '..', 'kwirth')
const NS = 'kwirth-helm-e2e'
const RELEASE = 'e2e'
const FULLNAME = `${RELEASE}-kwirth`
const LOCAL_PORT = 38831
const ADMIN_BLOB = 'eyJpZCI6ImFkbWluIiwibmFtZSI6Ik5pY2tsYXVzIFdpcnRoIiwicGFzc3dvcmQiOiJwYXNzd29yZCIsInJlc291cmNlcyI6ImNsdXN0ZXIsYWRtaW46Ojo6In0='
const E2E_USER_BLOB = Buffer.from(JSON.stringify({ id: 'e2e', name: 'E2E User', password: 'x', resources: 'cluster,view::::' })).toString('base64')

let failures = 0
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`)
    if (!ok) failures++
}
// with an inherited stdout execFileSync returns null, hence the fallback
const sh = (cmd, args, opts = {}) => (execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }) ?? '').toString().trim()
const shQuiet = (cmd, args) => { try { return sh(cmd, args) } catch { return '' } }
const kget = (kind, name, jsonpath) => shQuiet('kubectl', ['get', kind, name, '-n', NS, '-o', `jsonpath=${jsonpath}`])
const exists = (kind, name, ns = NS) => { try { sh('kubectl', ['get', kind, name, ...(ns ? ['-n', ns] : [])]); return true } catch { return false } }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const cleanup = () => {
    shQuiet('helm', ['uninstall', RELEASE, '-n', NS, '--wait'])
    shQuiet('kubectl', ['delete', 'ns', NS, '--ignore-not-found', '--wait=true'])
    shQuiet('kubectl', ['delete', 'clusterrole', `${FULLNAME}-cr`, '--ignore-not-found'])
    shQuiet('kubectl', ['delete', 'clusterrolebinding', `${FULLNAME}-crb`, '--ignore-not-found'])
}

/*
    HTTP reaches the pod through the API server proxy ('kubectl proxy' + the service proxy path), not
    through 'kubectl port-forward': port-forward goes through the kubelet streaming channel, which on some
    dev clusters (k3d with swapped node IPs) fails with x509/'pod not found', while the API server proxy
    only needs the cluster network. Every verb works through it, so the login POST goes the same way.
*/
const withProxy = async (fn) => {
    const proxy = spawn('kubectl', ['proxy', `--port=${LOCAL_PORT}`], { stdio: ['ignore', 'ignore', 'pipe'] })
    proxy.stderr.on('data', d => console.log(`kubectl proxy: ${d.toString().trim()}`))
    const base = `http://127.0.0.1:${LOCAL_PORT}/api/v1/namespaces/${NS}/services/${FULLNAME}-svc:3883/proxy`
    try {
        let ready = false
        let last = ''
        for (let i = 0; i < 30 && !ready; i++) {
            await sleep(1000)
            try {
                const r = await fetch(`${base}/healthz`)
                ready = r.ok
                last = `status ${r.status}`
            }
            catch (err) {
                last = err.cause?.code || err.message
            }
        }
        check('the service answers through the API server proxy', ready, last)
        if (ready) await fn(base)
    }
    finally {
        proxy.kill()
    }
}

const main = async () => {
    console.log(`Context: ${shQuiet('kubectl', ['config', 'current-context'])}  namespace: ${NS}  release: ${RELEASE}`)
    console.log('--- clean slate')
    cleanup()

    console.log('--- install')
    sh('helm', ['install', RELEASE, chartDir, '-n', NS, '--create-namespace', '--wait', '--timeout', '8m'], { stdio: ['ignore', 'inherit', 'inherit'] })
    check('Deployment is available', kget('deployment', FULLNAME, '{.status.availableReplicas}') === '1')
    check('users Secret kwirth-users has the bootstrap admin', kget('secret', 'kwirth-users', '{.data.admin}') === ADMIN_BLOB)
    check('users Secret carries resource-policy keep', kget('secret', 'kwirth-users', '{.metadata.annotations.helm\\.sh/resource-policy}') === 'keep')
    check('API keys ConfigMap kwirth.keys exists', exists('configmap', 'kwirth.keys'))
    check('env Secret holds MASTERKEY', Buffer.from(kget('secret', `${FULLNAME}-env`, '{.data.MASTERKEY}'), 'base64').toString() === 'Kwirth4Ever')
    check('image is pinned, not latest', !kget('deployment', FULLNAME, '{.spec.template.spec.containers[0].image}').endsWith(':latest'), kget('deployment', FULLNAME, '{.spec.template.spec.containers[0].image}'))
    const rules = kget('clusterrole', `${FULLNAME}-cr`, '{.rules[0].apiGroups}')
    check('ClusterRole is the explicit list, not *', rules.includes('metrics.k8s.io') && !rules.includes('"*"'), rules)

    await withProxy(async (base) => {
        // The API server proxy answers 503 while the endpoints list is empty (a readiness flap right after
        // the start), so every call is retried on 503; a persistent 503 is still reported, with its body.
        const call = async (url, init) => {
            let r
            for (let i = 0; i < 15; i++) {
                r = await fetch(url, init)
                if (r.status !== 503) return { status: r.status, body: await r.text() }
                await sleep(2000)
            }
            return { status: r.status, body: await r.text() }
        }
        const healthz = await call(`${base}/healthz`)
        check('GET /healthz answers 200', healthz.status === 200, `status ${healthz.status}`)
        const front = await call(`${base}/kwirth/`)
        check('GET /kwirth/ serves the front end', front.status === 200 && /<html/i.test(front.body), `status ${front.status} ${front.status === 200 ? '' : front.body.slice(0, 120)}`)
        // the front end sends sha256(password), never the clear text
        const sha256 = createHash('sha256').update('password').digest('hex')
        const login = await call(`${base}/kwirth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user: 'admin', password: sha256 }) })
        check('POST /kwirth/login admin/password answers 201 (first login: the users Secret is read)', login.status === 201, `status ${login.status} ${login.status === 201 ? '' : login.body.slice(0, 120)}`)
        const bad = await call(`${base}/kwirth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user: 'nobody', password: 'x' }) })
        check('POST /kwirth/login with an unknown user answers 401', bad.status === 401, `status ${bad.status}`)
        const restarts = shQuiet('kubectl', ['get', 'pods', '-n', NS, '-l', `app.kubernetes.io/instance=${RELEASE}`, '-o', 'jsonpath={.items[*].status.containerStatuses[0].restartCount}'])
        check('the pod has not restarted since the install', restarts === '0', `restartCount ${restarts}`)
    })

    console.log('--- a user is added outside Helm, then upgrade')
    sh('kubectl', ['patch', 'secret', 'kwirth-users', '-n', NS, '--type', 'merge', '-p', JSON.stringify({ data: { e2e: E2E_USER_BLOB } })])
    sh('helm', ['upgrade', RELEASE, chartDir, '-n', NS, '--set', 'kwirth.config.metricsInterval=30', '--wait', '--timeout', '8m'], { stdio: ['ignore', 'inherit', 'inherit'] })
    check('upgrade applied (METRICSINTERVAL=30)', kget('deployment', FULLNAME, '{.spec.template.spec.containers[0].env[?(@.name=="METRICSINTERVAL")].value}') === '30')
    check('the user added outside Helm survived the upgrade', kget('secret', 'kwirth-users', '{.data.e2e}') === E2E_USER_BLOB)
    check('the bootstrap admin is still there', kget('secret', 'kwirth-users', '{.data.admin}') === ADMIN_BLOB)
    check('Deployment is available after the upgrade', kget('deployment', FULLNAME, '{.status.availableReplicas}') === '1')

    console.log('--- uninstall')
    sh('helm', ['uninstall', RELEASE, '-n', NS, '--wait'], { stdio: ['ignore', 'inherit', 'inherit'] })
    check('Deployment is gone', !exists('deployment', FULLNAME))
    check('ClusterRole is gone', !exists('clusterrole', `${FULLNAME}-cr`, null))
    check('users Secret is KEPT', exists('secret', 'kwirth-users'))
    check('API keys ConfigMap is KEPT', exists('configmap', 'kwirth.keys'))
    check('the user added outside Helm is still in the kept Secret', kget('secret', 'kwirth-users', '{.data.e2e}') === E2E_USER_BLOB)

    console.log('--- cleanup')
    cleanup()
    check('namespace removed', !exists('ns', NS, null))
}

main()
    .catch(err => { console.error(err.stderr || err.message || err); failures++; cleanup() })
    .finally(() => {
        console.log(failures === 0 ? '\nE2E: all checks passed' : `\nE2E: ${failures} check(s) FAILED`)
        process.exit(failures === 0 ? 0 : 1)
    })
