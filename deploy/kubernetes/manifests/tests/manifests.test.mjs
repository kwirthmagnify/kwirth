/*
    Unit tests of kwirth-full-ro.yaml, the deployment with no write permission at all. They need
    nothing but node — no cluster, no helm.

    It grants with a single wildcard rule, because the events provider watches every CRD it sees
    appear and a cluster's CRDs cannot be known when the manifest is written. What is checked there
    is the VERBS, which is where the safety actually lives.

    The enumerated alternative still ships, commented in the header between STRICT-RULES-BEGIN and
    STRICT-RULES-END, for installations that require Secrets to stay unreadable. It is advice we
    give, so it is tested like code: parsed out of the comment and checked against what back/src
    really calls. That check is what caught nodes/stats missing.

    Run:  node --test deploy/kubernetes/manifests/tests/manifests.test.mjs
*/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..', '..', '..')
const yaml = createRequire(path.join(repoRoot, 'back', 'package.json'))('js-yaml')

const MANIFEST = 'kwirth-full-ro.yaml'
const READ_VERBS = ['get', 'list', 'watch']

const text = readFileSync(path.resolve(here, '..', MANIFEST), 'utf8')
const docs = yaml.loadAll(text).filter(Boolean)
const find = (kind, name) => docs.find(d => d.kind === kind && (!name || d.metadata.name === name))
const deployment = () => find('Deployment')
const container = () => deployment().spec.template.spec.containers[0]
const envOf = () => Object.fromEntries(container().env.map(e => [e.name, e.value]))

/*
    The enumerated alternative, lifted out of the header comment. Uncommenting it by hand is exactly
    what a user would do, so the test does the same thing and then parses it: if it stops being
    valid YAML, or stops covering what the back calls, this fails.
*/
const strictRules = () => {
    const m = text.match(/STRICT-RULES-BEGIN\r?\n([\s\S]*?)# STRICT-RULES-END/)
    assert.ok(m, `${MANIFEST} has no STRICT-RULES block`)
    const body = m[1].split(/\r?\n/).map(l => l.replace(/^#/, '')).join('\n')
    const rules = yaml.load(body)
    assert.ok(Array.isArray(rules) && rules.length > 0, `${MANIFEST}: the STRICT-RULES block is not a list of rules`)
    return rules
}

const asSet = (rules) => new Set(rules.flatMap(r => r.apiGroups.flatMap(g => r.resources.map(res => `${g}/${res}`))))

// The api client field in ClusterInfo tells which API group the call lands on. This is the test's
// model of the k8s client naming, not something the manifest can get wrong on its own.
const GROUP_OF_CLIENT = {
    coreApi: '',
    appsApi: 'apps',
    batchApi: 'batch',
    autoscalingApi: 'autoscaling',
    policyApi: 'policy',
    coordinationApi: 'coordination.k8s.io',
    networkApi: 'networking.k8s.io',
    storageApi: 'storage.k8s.io',
    nodeApi: 'node.k8s.io',
    schedulingApi: 'scheduling.k8s.io',
    admissionApi: 'admissionregistration.k8s.io',
    extensionApi: 'apiextensions.k8s.io',
    rbacApi: 'rbac.authorization.k8s.io'
}

// Where the client's method name does not pluralize into the RBAC resource name.
const RESOURCE_OVERRIDE = {
    'coreApi.readNamespacedPodLog': 'pods/log',
    'coreApi.readNamespacedPodStatus': 'pods/status',
    'coreApi.listEndpointsForAllNamespaces': 'endpoints'
}

// Reads the STRICT alternative deliberately leaves out, each for a stated reason. Anything NOT here
// has to be in it, which is the point of the coverage test.
const UNGRANTED_READS = {
    'coreApi.listSecretForAllNamespaces': 'the whole point of the strict variant is that Secrets stay unreadable',
    'coreApi.listServiceAccountForAllNamespaces': 'travels with secrets',
    'coreApi.readNamespacedSecret': 'the store is the PVC, so there is no Secret to read'
}

const pluralize = (kind) => {
    const k = kind.toLowerCase()
    if (/(s|x|ch|sh)$/.test(k)) return k + 'es'
    if (/[^aeiou]y$/.test(k)) return k.slice(0, -1) + 'ies'
    return k + 's'
}

const sourceFiles = (dir) => {
    const out = []
    for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry)
        if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
        else if (entry.endsWith('.ts')) out.push(full)
    }
    return out
}

/*
    Every read call the back makes, as '<client>.<method>' -> '<group>/<resource>'. Only read verbs:
    the write calls are Magnify's command half and the ops plugins, which this deployment drops on
    purpose.
*/
const readCalls = () => {
    const calls = new Map()
    const clients = Object.keys(GROUP_OF_CLIENT).join('|')
    const re = new RegExp(`\\b(${clients})\\.(list|read)([A-Za-z]+)\\(`, 'g')
    for (const file of sourceFiles(path.join(repoRoot, 'back', 'src'))) {
        const source = readFileSync(file, 'utf8')
        let m
        while ((m = re.exec(source)) !== null) {
            const rest = m[3]
            if (rest === 'APIResources') continue   // discovery, never gated by RBAC
            const key = `${m[1]}.${m[2]}${rest}`
            const kind = rest.replace(/^Namespaced/, '').replace(/ForAllNamespaces$/, '')
            calls.set(key, `${GROUP_OF_CLIENT[m[1]]}/${RESOURCE_OVERRIDE[key] ?? pluralize(kind)}`)
        }
    }
    return calls
}

test('one applyable bundle of seven objects, and not a Role among them', () => {
    assert.deepEqual(docs.map(d => `${d.kind}/${d.metadata.name}`), [
        'Namespace/kwirth',
        'ServiceAccount/kwirth-sa',
        'ClusterRole/kwirth-full-ro-cr',
        'ClusterRoleBinding/kwirth-full-ro-crb',
        'PersistentVolumeClaim/kwirth-store',
        'Deployment/kwirth',
        'Service/kwirth-svc'
    ])

    /*
        There WAS a second manifest with a namespaced Role, whose single rule let Kwirth mint a token
        for its own ServiceAccount so the metrics provider could reach the kubelet. Reading the token
        Kubernetes already projects into the pod made that rule unnecessary, and two files that
        differ by a rule that does nothing are two files somebody has to maintain and explain.
    */
    assert.equal(find('Role'), undefined, 'minting a token is no longer needed: the projected one is read instead')
    assert.equal(find('RoleBinding'), undefined)

    // the users Secret of kwirth.yaml is gone on purpose: with the store on the PVC, the back seeds
    // the admin itself on first boot (createAdminUserIfMissing). Shipping one would be a second,
    // stale source of truth for the password.
    assert.equal(find('Secret'), undefined)
})

test('the ClusterRole reads everything and changes nothing', () => {
    const rules = find('ClusterRole').rules
    // one rule, on purpose: enumerating cannot cover the CRDs the events provider discovers
    assert.equal(rules.length, 1)
    assert.deepEqual(rules[0].apiGroups, ['*'])
    assert.deepEqual(rules[0].resources, ['*'])
    // the whole safety of the wildcard lives here. exec and eviction are 'create', so three read
    // verbs deny them as surely as not naming the resource would.
    assert.deepEqual(rules[0].verbs, READ_VERBS)

    const crb = find('ClusterRoleBinding')
    assert.equal(crb.roleRef.name, 'kwirth-full-ro-cr')
    assert.equal(crb.subjects[0].name, 'kwirth-sa')
    assert.equal(crb.subjects[0].namespace, 'kwirth')
})

test('the strict alternative in the header is valid and still read-only', () => {
    for (const rule of strictRules()) {
        for (const verb of rule.verbs) {
            assert.ok(READ_VERBS.includes(verb), `strict block has verb '${verb}' on ${rule.resources}`)
        }
        assert.ok(!rule.apiGroups.includes('*'), `strict block wildcards a group on ${rule.resources}`)
        assert.ok(!rule.resources.includes('*'), `strict block wildcards resources on ${rule.apiGroups}`)
    }
})

test('the strict alternative covers every resource the back reads', () => {
    const granted = asSet(strictRules())
    const missing = []
    for (const [call, resource] of readCalls()) {
        if (granted.has(resource) || UNGRANTED_READS[call]) continue
        missing.push(`${call} needs '${resource}'`)
    }
    assert.deepEqual(missing, [], `the strict block does not cover what back/src calls:\n  ${missing.join('\n  ')}`)

    // the subresources that only exist spelled out, which 'resources: [*]' hides
    assert.ok(granted.has('/pods/log'), 'missing pods/log')
    assert.ok(granted.has('/pods/status'), 'missing pods/status')
    // readNodeMetrics reads TWO kubelet paths and the kubelet authorizes them against different
    // subresources: /metrics/cadvisor -> nodes/metrics, /stats/summary -> nodes/stats. Granting only
    // the first does not degrade node metrics, it breaks them, because readCAdvisorSummary throws on
    // a non-ok response.
    assert.ok(granted.has('/nodes/metrics'), 'missing nodes/metrics (/metrics/cadvisor)')
    assert.ok(granted.has('/nodes/stats'), 'missing nodes/stats (/stats/summary)')

    assert.ok(!granted.has('/pods/exec'), 'the strict block must not grant pods/exec')
    assert.ok(!granted.has('/nodes/proxy'), 'nodes/proxy is only used when Kwirth runs outside the cluster')
    // and the Secrets that are the entire reason this alternative exists
    assert.ok(!granted.has('/secrets'), 'the strict block exists so that Secrets stay unreadable')
})

test('the store is the PVC, and the back is told to use it', () => {
    const pvc = find('PersistentVolumeClaim', 'kwirth-store')
    assert.deepEqual(pvc.spec.accessModes, ['ReadWriteOnce'])

    const spec = deployment().spec
    // ReadWriteOnce plus a directory of files with no locking: one replica, and Recreate, or the
    // rollout deadlocks on a volume the old pod still holds
    assert.equal(spec.replicas, 1)
    assert.equal(spec.strategy.type, 'Recreate')

    const env = envOf()
    // any value but 'etcd' means "encrypted files at this path" (resolveStore, ExecutionEnvironment.ts)
    assert.ok(env.KWIRTH_STORE && env.KWIRTH_STORE !== 'etcd')

    const mount = container().volumeMounts.find(v => v.mountPath === env.KWIRTH_STORE)
    assert.ok(mount, `nothing is mounted at KWIRTH_STORE (${env.KWIRTH_STORE})`)
    assert.equal(spec.template.spec.volumes.find(v => v.name === mount.name).persistentVolumeClaim.claimName, pvc.metadata.name)

    // a 403 on the secure-log ConfigMap is guaranteed here, and writing it is not worth the noise
    assert.equal(env.EXITLOG, 'false')
})

test('the projected token is what pays for the metrics, so the automount is left alone', () => {
    const podSpec = deployment().spec.template.spec
    /*
        Setting automountServiceAccountToken to false would look like one more hardening step and
        would silently cost the metrics: that projected token is the only way this deployment reaches
        a kubelet, now that it cannot mint one.
    */
    assert.equal(podSpec.automountServiceAccountToken, undefined, 'leaving it at the default true is deliberate')
    assert.equal(envOf().CHANNEL_METRICS, 'true')
})

test('the pod runs with no capability, no escalation and a read-only image', () => {
    const sc = container().securityContext
    assert.equal(sc.allowPrivilegeEscalation, false)
    assert.equal(sc.readOnlyRootFilesystem, true)
    assert.deepEqual(sc.capabilities.drop, ['ALL'])
    assert.equal(sc.seccompProfile.type, 'RuntimeDefault')

    // readOnlyRootFilesystem only holds because everything written at runtime that is not the store
    // goes to os.tmpdir()
    const tmp = container().volumeMounts.find(v => v.mountPath === '/tmp')
    assert.ok(tmp, 'a read-only root filesystem needs a writable /tmp')
    assert.ok(deployment().spec.template.spec.volumes.find(v => v.name === tmp.name).emptyDir)
})

test('only the two channel switches the back actually reads are set', () => {
    assert.deepEqual(Object.keys(envOf()).filter(n => n.startsWith('CHANNEL_')).sort(), ['CHANNEL_MAGNIFY', 'CHANNEL_METRICS'])
})
