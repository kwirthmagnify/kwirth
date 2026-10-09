/*
    End-to-end run of the Kwirth Helm chart against the CURRENT kube context. It owns a namespace of its own
    (kwirth-helm-e2e) and a release of its own (e2e), creates them, drives them through install, upgrade and
    uninstall, and deletes them at the end. Nothing outside that namespace is touched, except the
    cluster-scoped RBAC of the release (e2e-kwirth-cr / e2e-kwirth-crb), which goes with it.

    It runs the chart's TWO modes, each in its own namespace and release:

      normal   (kwirth-helm-e2e / e2e)       install, upgrade, uninstall
      readonly (kwirth-helm-e2e-ro / e2ero)  install and uninstall, plus what the API server allows

    What it proves that the unit tests cannot:
      - the image starts and answers under the explicit RBAC list (no cluster-admin)
      - the users Secret the chart bootstraps is the one the core reads: the first login answers 201
        ('change your password'), which only happens when the admin user was found
      - an upgrade re-renders the LIVE users Secret (lookup), so a user added after the install survives
      - uninstall keeps the users Secret and the API keys ConfigMap (resource-policy keep)
      - in readonly, the API server really does deny exec, eviction, delete, patch and escalate — and
        the core seeds its admin on the VOLUME, with no users Secret anywhere, which the login proves

    Run:  node deploy/helm/tests/run-e2e.mjs
    Exit code 0 = every check passed. Needs helm and kubectl on the PATH.
*/
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const chartDir = path.resolve(here, '..', 'kwirth')
// to verify a stored hash the way the core does, rather than trusting its shape
const bcrypt = createRequire(path.resolve(here, '..', '..', '..', '..', 'back', 'package.json'))('bcryptjs')
const NS = 'kwirth-helm-e2e'
const RELEASE = 'e2e'
const FULLNAME = `${RELEASE}-kwirth`
const LOCAL_PORT = 38831
const E2E_USER_BLOB = Buffer.from(JSON.stringify({ id: 'e2e', name: 'E2E User', password: 'x', resources: 'cluster,view::::' })).toString('base64')

let failures = 0
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`)
    if (!ok) failures++
}
// with an inherited stdout execFileSync returns null, hence the fallback
const sh = (cmd, args, opts = {}) => (execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }) ?? '').toString().trim()
const shQuiet = (cmd, args) => { try { return sh(cmd, args) } catch { return '' } }
// the namespace defaults to the normal-mode one; the readonly phase passes its own
const kget = (kind, name, jsonpath, ns = NS) => shQuiet('kubectl', ['get', kind, name, '-n', ns, '-o', `jsonpath=${jsonpath}`])
const exists = (kind, name, ns = NS) => { try { sh('kubectl', ['get', kind, name, ...(ns ? ['-n', ns] : [])]); return true } catch { return false } }

/*
    The users Secret, read the way the CORE reads it: every value decoded and indexed by the 'id' inside
    the JSON, never by the Secret key.

    The key is not stable and must not be relied on. The chart writes base64url(id), and so does the
    core (IdentityService.writeUsers) — because an id is often an email and a Secret key cannot hold an
    '@' — but the core also REWRITES the whole Secret the first time somebody logs in, when it replaces
    the plain password with a bcrypt hash. Asserting on '.data.admin' is asserting on a container that
    the product is free to rename, and it did.
*/
const usersInSecret = (ns = NS) => {
    const raw = shQuiet('kubectl', ['get', 'secret', 'kwirth-users', '-n', ns, '-o', 'jsonpath={.data}'])
    const users = {}
    for (const value of Object.values(raw ? JSON.parse(raw) : {})) {
        try {
            const u = JSON.parse(Buffer.from(value, 'base64').toString())
            if (u && u.id) users[u.id] = u
        }
        catch { /* a corrupt value is not this test's business */ }
    }
    return users
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

/*
    KWIRTH_IMAGE overrides the image for the run, with pullPolicy IfNotPresent so a locally built one
    already on the node is used instead of being pulled. The chart's appVersion is the image it was
    tested with, and a change in the CORE cannot be exercised through it until that image is published:
    testing the chart against the Kwirth you just built is the point.
*/
const IMAGE_ARGS = process.env.KWIRTH_IMAGE
    ? ['--set', `kwirth.image.repository=${process.env.KWIRTH_IMAGE.split(':')[0]}`,
       '--set', `kwirth.image.tag=${process.env.KWIRTH_IMAGE.split(':')[1] ?? 'latest'}`,
       '--set', 'kwirth.image.pullPolicy=IfNotPresent']
    : []

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
    // captured, not inherited: the install NOTES are an assertion target here
    const installOut = sh('helm', ['install', RELEASE, chartDir, '-n', NS, '--create-namespace', ...IMAGE_ARGS, '--wait', '--timeout', '8m'])
    console.log(installOut)
    check('Deployment is available', kget('deployment', FULLNAME, '{.status.availableReplicas}') === '1')

    /*
        🔴 The bootstrap password is generated now, and the install notes are the only place it is ever
        shown in the clear. If the notes and the Secret disagree the operator is locked out of a healthy
        install — and a Helm helper runs again on every include, so a bare randAlphaNum would do exactly
        that. Nothing short of reading both can catch it.
    */
    const storedAdmin = usersInSecret().admin ?? {}
    const shownPassword = (installOut.match(/password : ([A-Za-z0-9]+)/) || [])[1]
    check('the install notes printed a generated password', /^[A-Za-z0-9]{20}$/.test(shownPassword || ''), shownPassword)
    // verified the way the core verifies it: bcrypt against the sha256 the front end sends. The Secret
    // never holds the clear text, so comparing the two strings would be comparing the wrong things.
    check('the printed password OPENS the hash in the users Secret',
        bcrypt.compareSync(createHash('sha256').update(shownPassword ?? '').digest('hex'), storedAdmin.password ?? ''))
    check('the password is NOT stored in clear text', /^\$2[aby]\$/.test(storedAdmin.password ?? ''), storedAdmin.password?.slice(0, 7))
    check('the bootstrap admin is an administrator', storedAdmin.id === 'admin' && storedAdmin.resources === 'cluster,admin::::')
    check('the published default password is gone', storedAdmin.password !== 'password')
    check('users Secret carries resource-policy keep', kget('secret', 'kwirth-users', '{.metadata.annotations.helm\\.sh/resource-policy}') === 'keep')
    check('API keys ConfigMap kwirth.keys exists', exists('configmap', 'kwirth.keys'))
    const masterkey = () => Buffer.from(kget('secret', `${FULLNAME}-masterkey`, '{.data.MASTERKEY}'), 'base64').toString()
    const mk1 = masterkey()
    check('MASTERKEY was generated, not shipped', /^[A-Za-z0-9]{40}$/.test(mk1) && mk1 !== 'Kwirth4Ever', mk1 ? `${mk1.slice(0, 6)}… (${mk1.length} chars)` : 'empty')
    check('the masterkey Secret carries resource-policy keep', kget('secret', `${FULLNAME}-masterkey`, '{.metadata.annotations.helm\\.sh/resource-policy}') === 'keep')
    check('no env Secret is rendered when there is nothing sensitive to carry', !exists('secret', `${FULLNAME}-env`))
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
        /*
            The front end sends sha256(password), never the clear text. 200 and not 201: the core's
            'change your password' prompt fires only for the literal 'password' (LoginApi,
            verifyPassword), which a generated one is precisely not — so this logs straight in, and
            the core re-saves the value as bcrypt on the way.
        */
        const sha256 = createHash('sha256').update(shownPassword ?? '').digest('hex')
        const login = await call(`${base}/kwirth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user: 'admin', password: sha256 }) })
        check('POST /kwirth/login with the PRINTED password answers 200 (the notes are usable)', login.status === 200, `status ${login.status} ${login.status === 200 ? '' : login.body.slice(0, 120)}`)
        const bad = await call(`${base}/kwirth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user: 'nobody', password: 'x' }) })
        check('POST /kwirth/login with an unknown user answers 401', bad.status === 401, `status ${bad.status}`)
        const restarts = shQuiet('kubectl', ['get', 'pods', '-n', NS, '-l', `app.kubernetes.io/instance=${RELEASE}`, '-o', 'jsonpath={.items[*].status.containerStatuses[0].restartCount}'])
        check('the pod has not restarted since the install', restarts === '0', `restartCount ${restarts}`)
    })

    console.log('--- a user is added outside Helm, then upgrade')
    // under base64url(id), which is the convention both the chart and the core write with
    sh('kubectl', ['patch', 'secret', 'kwirth-users', '-n', NS, '--type', 'merge', '-p', JSON.stringify({ data: { [Buffer.from('e2e', 'utf8').toString('base64url')]: E2E_USER_BLOB } })])
    sh('helm', ['upgrade', RELEASE, chartDir, '-n', NS, '--set', 'kwirth.config.metricsInterval=30', ...IMAGE_ARGS, '--wait', '--timeout', '8m'], { stdio: ['ignore', 'inherit', 'inherit'] })
    check('upgrade applied (METRICSINTERVAL=30)', kget('deployment', FULLNAME, '{.spec.template.spec.containers[0].env[?(@.name=="METRICSINTERVAL")].value}') === '30')
    check('the user added outside Helm survived the upgrade', usersInSecret().e2e?.name === 'E2E User')
    /*
        The admin's password is a bcrypt hash by now, not the printed one: somebody logged in above and
        the core re-saved it. What must survive the upgrade is the USER, not the plain value — and that
        the chart did not overwrite it with a freshly generated one, which is what would happen if the
        lookup ever stopped working.
    */
    const adminAfterUpgrade = usersInSecret().admin ?? {}
    check('the bootstrap admin survived the upgrade', adminAfterUpgrade.id === 'admin')
    /*
        Still a hash, and still THE one: it must keep opening with the password the install printed.
        Checking the prefix alone would pass just as happily on a hash of something else, which is
        exactly what a chart that regenerated the password on every upgrade would produce.
    */
    check('the stored password is still a bcrypt hash', /^\$2[aby]\$/.test(adminAfterUpgrade.password ?? ''), adminAfterUpgrade.password?.slice(0, 7))
    check('the chart did NOT regenerate the password on upgrade',
        bcrypt.compareSync(createHash('sha256').update(shownPassword ?? '').digest('hex'), adminAfterUpgrade.password ?? ''))
    check('Deployment is available after the upgrade', kget('deployment', FULLNAME, '{.status.availableReplicas}') === '1')
    /*
        🔴 The invariant that protects everything else. A MASTERKEY that moves is not a changed setting,
        it is data loss: every access key already issued stops validating, and with a filesystem store
        the configuration stops decrypting, after which the core seeds the default admin again and a
        lost install looks like a fresh one. 'helm template' cannot prove this — the lookup needs a
        cluster — so it can only be proved here.
    */
    check('MASTERKEY survived the upgrade unchanged', masterkey() === mk1)

    console.log('--- uninstall')
    sh('helm', ['uninstall', RELEASE, '-n', NS, '--wait'], { stdio: ['ignore', 'inherit', 'inherit'] })
    check('Deployment is gone', !exists('deployment', FULLNAME))
    check('ClusterRole is gone', !exists('clusterrole', `${FULLNAME}-cr`, null))
    check('users Secret is KEPT', exists('secret', 'kwirth-users'))
    check('API keys ConfigMap is KEPT', exists('configmap', 'kwirth.keys'))
    check('the user added outside Helm is still in the kept Secret', usersInSecret().e2e?.name === 'E2E User')
    check('masterkey Secret is KEPT', exists('secret', `${FULLNAME}-masterkey`))

    /*
        And the other half of it: a reinstall must ADOPT the kept key rather than mint a new one. The
        PVC is kept too, so a fresh key here would hand the new release a store it cannot decrypt —
        the exact failure that looks like a clean install and is not. No --wait: the Secret exists as
        soon as Helm has applied it, and that is all this needs to read.
    */
    console.log('--- reinstall over the kept objects')
    sh('helm', ['install', RELEASE, chartDir, '-n', NS, ...IMAGE_ARGS, '--wait=false'], { stdio: ['ignore', 'inherit', 'inherit'] })
    check('a reinstall reuses the kept MASTERKEY instead of minting a new one', masterkey() === mk1)

    console.log('--- cleanup')
    cleanup()
    check('namespace removed', !exists('ns', NS, null))

    await readOnlyPhase()
}

/*
    Mode 'readonly', in a namespace and a release of its own so nothing of the phase above (the users
    Secret is KEPT on uninstall, by design) can make this one look like it works when it does not.

    What only a cluster can settle here is the half that is not RBAC: the core keeps its configuration
    on the volume instead of in Secrets, seeds its own admin there, and reads it back. The login
    answering 201 is that whole story in one assertion — an install that could not write its store
    would have no admin to find.

    🔴 Subresources go through --subresource. 'can-i get pods/log' asks about the pod NAMED 'log',
    which 'get pods' already allows, so written the other way these checks pass whether the grant is
    there or not.
*/
const readOnlyPhase = async () => {
    const roNs = `${NS}-ro`
    const roRelease = 'e2ero'
    const roFull = `${roRelease}-kwirth`
    const subject = `system:serviceaccount:${roNs}:${roFull}-sa`

    const roCleanup = () => {
        shQuiet('helm', ['uninstall', roRelease, '-n', roNs, '--wait'])
        shQuiet('kubectl', ['delete', 'ns', roNs, '--ignore-not-found', '--wait=true'])
        shQuiet('kubectl', ['delete', 'clusterrole', `${roFull}-cr`, '--ignore-not-found'])
        shQuiet('kubectl', ['delete', 'clusterrolebinding', `${roFull}-crb`, '--ignore-not-found'])
    }

    const canI = (verb, resource, subresource) => {
        const args = ['auth', 'can-i', verb, resource, `--as=${subject}`, '--all-namespaces']
        if (subresource) args.push(`--subresource=${subresource}`)
        return shQuiet('kubectl', args) === 'yes'
    }
    const allowed = (verb, resource, subresource) =>
        check(`readonly CAN ${verb} ${resource}${subresource ? '/' + subresource : ''}`, canI(verb, resource, subresource))
    const denied = (verb, resource, subresource) =>
        check(`readonly CANNOT ${verb} ${resource}${subresource ? '/' + subresource : ''}`, !canI(verb, resource, subresource))

    console.log('\n=== mode: readonly ===')
    console.log('--- clean slate')
    roCleanup()

    console.log('--- install')
    sh('helm', ['install', roRelease, chartDir, '-n', roNs, '--create-namespace',
        '--set', 'kwirth.mode=readonly', '--set', 'kwirth.persistence.enabled=true', ...IMAGE_ARGS,
        '--wait', '--timeout', '8m'], { stdio: ['ignore', 'inherit', 'inherit'] })

    check('readonly: Deployment is available', kget('deployment', roFull, '{.status.availableReplicas}', roNs) === '1')
    check('readonly: the chart rendered NO users Secret', !exists('secret', 'kwirth-users', roNs))
    check('readonly: the PVC is bound', kget('pvc', `${roFull}-data`, '{.status.phase}', roNs) === 'Bound')
    check('readonly: KWIRTH_STORE points at the volume',
        kget('deployment', roFull, '{.spec.template.spec.containers[0].env[?(@.name=="KWIRTH_STORE")].value}', roNs) === '/mnt/kwirth-data')
    check('readonly: EXITLOG is off',
        kget('deployment', roFull, '{.spec.template.spec.containers[0].env[?(@.name=="EXITLOG")].value}', roNs) === 'false')
    // here the generated key is not only signing api keys: it is what the volume is encrypted with
    const roMk = Buffer.from(kget('secret', `${roFull}-masterkey`, '{.data.MASTERKEY}', roNs), 'base64').toString()
    check('readonly: MASTERKEY was generated', /^[A-Za-z0-9]{40}$/.test(roMk))
    const roVerbs = shQuiet('kubectl', ['get', 'clusterrole', `${roFull}-cr`, '-o', 'jsonpath={.rules[0].verbs}'])
    check('readonly: the ClusterRole is get/list/watch', roVerbs === '["get","list","watch"]', roVerbs)
    check('readonly: no namespaced Role was created', shQuiet('kubectl', ['get', 'role', '-n', roNs, '--no-headers']) === '')

    console.log('--- what the API server actually allows')
    allowed('get', 'pods')
    allowed('watch', 'pods')
    allowed('get', 'pods', 'log')
    allowed('list', 'nodes')
    allowed('list', 'jobs.batch')
    allowed('get', 'nodes', 'metrics')
    denied('create', 'pods', 'exec')
    denied('create', 'pods', 'eviction')
    denied('delete', 'pods')
    denied('patch', 'deployments.apps')
    denied('create', 'secrets')
    denied('update', 'secrets')
    denied('escalate', 'clusterroles.rbac.authorization.k8s.io')
    // the price of the wildcard, asserted so it is never a surprise: RBAC cannot grant all-but-one
    check('readonly CAN list secrets (the acknowledged price of the wildcard)', canI('list', 'secrets'))

    await (async () => {
        const proxy = spawn('kubectl', ['proxy', `--port=${LOCAL_PORT + 1}`], { stdio: ['ignore', 'ignore', 'pipe'] })
        const base = `http://127.0.0.1:${LOCAL_PORT + 1}/api/v1/namespaces/${roNs}/services/${roFull}-svc:3883/proxy`
        try {
            let ready = false
            for (let i = 0; i < 30 && !ready; i++) {
                await sleep(1000)
                try { ready = (await fetch(`${base}/healthz`)).ok } catch { /* not up yet */ }
            }
            check('readonly: the service answers', ready)
            if (!ready) return
            /*
                The one that matters. No users Secret was created, so the admin this logs in as can only
                have been seeded by the core onto the volume — which is the half of 'read-only' that is
                not RBAC, and the half that silently fails if the store is wrong.
            */
            const sha256 = createHash('sha256').update('password').digest('hex')
            let login
            for (let i = 0; i < 15; i++) {
                login = await fetch(`${base}/kwirth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user: 'admin', password: sha256 }) })
                if (login.status !== 503) break
                await sleep(2000)
            }
            check('readonly: admin/password logs in, so the core seeded its users on the volume', login.status === 201, `status ${login.status}`)
        }
        finally {
            proxy.kill()
        }
    })()

    const roRestarts = shQuiet('kubectl', ['get', 'pods', '-n', roNs, '-l', `app.kubernetes.io/instance=${roRelease}`, '-o', 'jsonpath={.items[*].status.containerStatuses[0].restartCount}'])
    check('readonly: the pod has not restarted', roRestarts === '0', `restartCount ${roRestarts}`)

    console.log('--- cleanup')
    roCleanup()
    check('readonly: namespace removed', !exists('ns', roNs, null))

    await zeroPhase()
}


/*
    Mode 'zero' — a pod that is not allowed to touch the cluster at all, and is told so.

    It is not 'readonly' with fewer verbs: there is nothing RBAC-shaped to render, no credential
    reaches the container, and the core is launched as a container rather than as a Kubernetes
    workload. What only a cluster can settle is that it COMES UP that way — the unit tests can read
    the rendered YAML, but not that a Kwirth told it is not in Kubernetes actually serves.
*/
const zeroPhase = async () => {
    const zNs = `${NS}-zero`
    const zRelease = 'e2ezero'
    const zFull = `${zRelease}-kwirth`

    const zCleanup = () => {
        shQuiet('helm', ['uninstall', zRelease, '-n', zNs, '--wait'])
        shQuiet('kubectl', ['delete', 'ns', zNs, '--ignore-not-found', '--wait=true'])
    }

    console.log('\n=== mode: zero ===')
    console.log('--- clean slate')
    zCleanup()

    console.log('--- install')
    sh('helm', ['install', zRelease, chartDir, '-n', zNs, '--create-namespace',
        '--set', 'kwirth.mode=zero', '--set', 'kwirth.persistence.enabled=true',
        ...IMAGE_ARGS, '--wait', '--timeout', '8m'], { stdio: ['ignore', 'inherit', 'inherit'] })

    check('zero: Deployment is available', kget('deployment', zFull, '{.status.availableReplicas}', zNs) === '1')

    // the whole manifest, asserted as an absence
    for (const kind of ['serviceaccount', 'role', 'rolebinding']) {
        const found = shQuiet('kubectl', ['get', kind, '-n', zNs, '-o', 'jsonpath={.items[*].metadata.name}'])
            .split(' ').filter(n => n && n !== 'default')
        check(`zero: no ${kind} of its own`, found.length === 0, found.join(', '))
    }
    check('zero: no ClusterRole', !exists('clusterrole', `${zFull}-cr`, null))
    check('zero: no ClusterRoleBinding', !exists('clusterrolebinding', `${zFull}-crb`, null))

    // and the half that is not RBAC: with no token mounted there is nothing in the container to use
    check('zero: the projected token is turned off',
        kget('deployment', zFull, '{.spec.template.spec.automountServiceAccountToken}', zNs) === 'false')
    check('zero: the core is told it is a container, not a Kubernetes workload',
        kget('deployment', zFull, '{.spec.template.spec.containers[0].env[?(@.name=="FORCE")].value}', zNs) === 'container')
    check('zero: the store is the volume', kget('pvc', `${zFull}-data`, '{.status.phase}', zNs) === 'Bound')
    check('zero: the chart rendered NO users Secret', !exists('secret', 'kwirth-users', zNs))

    /*
        🔴 The one that cannot be read off the YAML. A pod told FORCE=container inside a cluster either
        comes up as a container with no cluster, or it falls back to the client's invented
        localhost:8080, fails its first call and never starts. The log says which.
    */
    const zLog = shQuiet('kubectl', ['logs', '-n', zNs, `deploy/${zFull}`])
    check("zero: it came up as 'container', not as a Kubernetes workload", /Execution environment: 'container'/.test(zLog))
    check('zero: and with no cluster', /"clusterType":"none"/.test(zLog))
    check('zero: it never went looking for an API it cannot reach', !/localhost:8080/.test(zLog))

    await (async () => {
        const proxy = spawn('kubectl', ['proxy', `--port=${LOCAL_PORT + 2}`], { stdio: ['ignore', 'ignore', 'pipe'] })
        const base = `http://127.0.0.1:${LOCAL_PORT + 2}/api/v1/namespaces/${zNs}/services/${zFull}-svc:3883/proxy`
        try {
            let ready = false
            for (let i = 0; i < 30 && !ready; i++) {
                await sleep(1000)
                try { ready = (await fetch(`${base}/healthz`)).ok } catch { /* not up yet */ }
            }
            check('zero: the service answers', ready)
            if (!ready) return
            /*
                No users Secret exists, so the admin this logs in as can only have been seeded by the
                core onto the volume — and here that volume is the only store there is. 201 and not
                200: the core seeds the literal 'password', which is what its 'change it' prompt fires
                on, unlike the one the chart generates for the other modes.
            */
            const sha256 = createHash('sha256').update('password').digest('hex')
            let login
            for (let i = 0; i < 15; i++) {
                login = await fetch(`${base}/kwirth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user: 'admin', password: sha256 }) })
                if (login.status !== 503) break
                await sleep(2000)
            }
            check('zero: admin logs in, so the core seeded its users on the volume', login.status === 201, `status ${login.status}`)
        }
        finally {
            proxy.kill()
        }
    })()

    const zRestarts = shQuiet('kubectl', ['get', 'pods', '-n', zNs, '-l', `app.kubernetes.io/instance=${zRelease}`, '-o', 'jsonpath={.items[*].status.containerStatuses[0].restartCount}'])
    check('zero: the pod has not restarted', zRestarts === '0', `restartCount ${zRestarts}`)

    console.log('--- cleanup')
    zCleanup()
    check('zero: namespace removed', !exists('ns', zNs, null))
}

main()
    .catch(err => { console.error(err.stderr || err.message || err); failures++; cleanup() })
    .finally(() => {
        console.log(failures === 0 ? '\nE2E: all checks passed' : `\nE2E: ${failures} check(s) FAILED`)
        process.exit(failures === 0 ? 0 : 1)
    })
