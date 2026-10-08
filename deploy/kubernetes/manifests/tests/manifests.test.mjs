/*
    Unit tests of the two least-privilege manifests. They need nothing but node — no cluster, no helm.

        kwirth-readonly.yaml   read-only, plus ONE create: a token for its own ServiceAccount, which
                               is what lets the metrics provider reach the kubelet
        kwirth-full-ro.yaml    the same, minus that rule and minus the metrics it pays for. Not one
                               verb in the file is anything but get/list/watch

    Both grant with a single wildcard rule, because the events provider watches every CRD it sees
    appear and a cluster's CRDs cannot be known when the manifest is written. What the tests check
    there is the VERBS, which is where the safety actually lives.

    The enumerated alternative still ships, commented in each header between STRICT-RULES-BEGIN and
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

const textOf = (file) => readFileSync(path.resolve(here, '..', file), 'utf8')
const load = (file) => yaml.loadAll(textOf(file)).filter(Boolean)

/*
    The enumerated alternative, lifted out of the header comment. Uncommenting it by hand is exactly
    what a user would do, so the test does the same thing and then parses it: if it stops being
    valid YAML, or stops covering what the back calls, this fails.
*/
const strictRules = (file) => {
    const m = textOf(file).match(/STRICT-RULES-BEGIN\r?\n([\s\S]*?)# STRICT-RULES-END/)
    assert.ok(m, `${file} has no STRICT-RULES block`)
    const body = m[1].split(/\r?\n/).map(l => l.replace(/^#/, '')).join('\n')
    const rules = yaml.load(body)
    assert.ok(Array.isArray(rules) && rules.length > 0, `${file}: the STRICT-RULES block is not a list of rules`)
    return rules
}

const asSet = (rules) => new Set(rules.flatMap(r => r.apiGroups.flatMap(g => r.resources.map(res => `${g}/${res}`))))

const MANIFESTS = [
    {
        file: 'kwirth-readonly.yaml',
        clusterRole: 'kwirth-readonly-cr',
        role: 'kwirth-token',
        kubeletMetrics: true,
        objects: [
            'Namespace/kwirth',
            'ServiceAccount/kwirth-sa',
            'ClusterRole/kwirth-readonly-cr',
            'ClusterRoleBinding/kwirth-readonly-crb',
            'Role/kwirth-token',
            'RoleBinding/kwirth-token-rb',
            'PersistentVolumeClaim/kwirth-store',
            'Deployment/kwirth',
            'Service/kwirth-svc'
        ]
    },
    {
        file: 'kwirth-full-ro.yaml',
        clusterRole: 'kwirth-full-ro-cr',
        role: null,
        kubeletMetrics: false,
        objects: [
            'Namespace/kwirth',
            'ServiceAccount/kwirth-sa',
            'ClusterRole/kwirth-full-ro-cr',
            'ClusterRoleBinding/kwirth-full-ro-crb',
            'PersistentVolumeClaim/kwirth-store',
            'Deployment/kwirth',
            'Service/kwirth-svc'
        ]
    }
]

// The api client field in ClusterInfo tells which API group the call lands on. This is the test's
// model of the k8s client naming, not something a manifest can get wrong on its own.
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
    the write calls are Magnify's command half and the ops plugins, which these deployments drop on
    purpose.
*/
const readCalls = () => {
    const calls = new Map()
    const clients = Object.keys(GROUP_OF_CLIENT).join('|')
    const re = new RegExp(`\\b(${clients})\\.(list|read)([A-Za-z]+)\\(`, 'g')
    for (const file of sourceFiles(path.join(repoRoot, 'back', 'src'))) {
        const text = readFileSync(file, 'utf8')
        let m
        while ((m = re.exec(text)) !== null) {
            const rest = m[3]
            if (rest === 'APIResources') continue   // discovery, never gated by RBAC
            const key = `${m[1]}.${m[2]}${rest}`
            const kind = rest.replace(/^Namespaced/, '').replace(/ForAllNamespaces$/, '')
            calls.set(key, `${GROUP_OF_CLIENT[m[1]]}/${RESOURCE_OVERRIDE[key] ?? pluralize(kind)}`)
        }
    }
    return calls
}

const CALLS = readCalls()
const READ_VERBS = ['get', 'list', 'watch']

for (const manifest of MANIFESTS) {
    const docs = load(manifest.file)
    const find = (kind, name) => docs.find(d => d.kind === kind && (!name || d.metadata.name === name))
    const deployment = () => find('Deployment')
    const container = () => deployment().spec.template.spec.containers[0]
    const envOf = () => Object.fromEntries(container().env.map(e => [e.name, e.value]))
    const name = manifest.file

    test(`${name}: one applyable bundle, exactly the expected objects`, () => {
        assert.deepEqual(docs.map(d => `${d.kind}/${d.metadata.name}`), manifest.objects)

        // the users Secret of kwirth.yaml is gone on purpose: with the store on the PVC, the back
        // seeds the admin itself on first boot (createAdminUserIfMissing). Shipping one would be a
        // second, stale source of truth for the password.
        assert.equal(find('Secret'), undefined)
    })

    test(`${name}: the ClusterRole reads everything and changes nothing`, () => {
        const rules = find('ClusterRole').rules
        // one rule, on purpose: enumerating cannot cover the CRDs the events provider discovers
        assert.equal(rules.length, 1)
        assert.deepEqual(rules[0].apiGroups, ['*'])
        assert.deepEqual(rules[0].resources, ['*'])
        // the whole safety of the wildcard lives here. exec and eviction are 'create', so three
        // read verbs deny them as surely as not naming the resource would.
        assert.deepEqual(rules[0].verbs, READ_VERBS)

        const crb = find('ClusterRoleBinding')
        assert.equal(crb.roleRef.name, manifest.clusterRole)
        assert.equal(crb.subjects[0].name, 'kwirth-sa')
        assert.equal(crb.subjects[0].namespace, 'kwirth')
    })

    test(`${name}: the strict alternative in the header is valid and still read-only`, () => {
        for (const rule of strictRules(manifest.file)) {
            for (const verb of rule.verbs) {
                assert.ok(READ_VERBS.includes(verb), `strict block has verb '${verb}' on ${rule.resources}`)
            }
            assert.ok(!rule.apiGroups.includes('*'), `strict block wildcards a group on ${rule.resources}`)
            assert.ok(!rule.resources.includes('*'), `strict block wildcards resources on ${rule.apiGroups}`)
        }
    })

    test(`${name}: the strict alternative covers every resource the back reads`, () => {
        const granted = asSet(strictRules(manifest.file))
        const missing = []
        for (const [call, resource] of CALLS) {
            if (granted.has(resource) || UNGRANTED_READS[call]) continue
            missing.push(`${call} needs '${resource}'`)
        }
        assert.deepEqual(missing, [], `the strict block does not cover what back/src calls:\n  ${missing.join('\n  ')}`)

        // the subresources that only exist spelled out, which 'resources: [*]' hides
        assert.ok(granted.has('/pods/log'), 'missing pods/log')
        assert.ok(granted.has('/pods/status'), 'missing pods/status')
        assert.ok(!granted.has('/pods/exec'), 'the strict block must not grant pods/exec')
        assert.ok(!granted.has('/nodes/proxy'), 'nodes/proxy is only used when Kwirth runs outside the cluster')
        // and the Secrets that are the entire reason this alternative exists
        assert.ok(!granted.has('/secrets'), 'the strict block exists so that Secrets stay unreadable')
    })

    test(`${name}: the store is the PVC, and the back is told to use it`, () => {
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

        // a 403 on the secure-log ConfigMap makes the back wait an hour before exiting (index.ts), so
        // a deployment with no write permission has to turn it off
        assert.equal(env.EXITLOG, 'false')
    })

    test(`${name}: the pod runs with no capability, no escalation and a read-only image`, () => {
        const sc = container().securityContext
        assert.equal(sc.allowPrivilegeEscalation, false)
        assert.equal(sc.readOnlyRootFilesystem, true)
        assert.deepEqual(sc.capabilities.drop, ['ALL'])
        assert.equal(sc.seccompProfile.type, 'RuntimeDefault')

        // readOnlyRootFilesystem only holds because everything written at runtime that is not the
        // store goes to os.tmpdir()
        const tmp = container().volumeMounts.find(v => v.mountPath === '/tmp')
        assert.ok(tmp, 'a read-only root filesystem needs a writable /tmp')
        assert.ok(deployment().spec.template.spec.volumes.find(v => v.name === tmp.name).emptyDir)
    })

    test(`${name}: only the two channel switches the back actually reads are set`, () => {
        assert.deepEqual(Object.keys(envOf()).filter(n => n.startsWith('CHANNEL_')).sort(), ['CHANNEL_MAGNIFY', 'CHANNEL_METRICS'])
    })

    /*
        The one decision the two files differ by, asserted from both sides so neither drifts into the
        other: the token rule and the metrics channel are one package.
    */
    if (manifest.kubeletMetrics) {
        test(`${name}: minting its own token is the only non-read verb in the file`, () => {
            const role = find('Role', manifest.role)
            assert.equal(role.metadata.namespace, 'kwirth')

            // Moving the store to the PVC is what removed the configmaps/secrets write. If a rule
            // ever comes back here, the store went back into the cluster.
            assert.equal(role.rules.length, 1)
            const token = role.rules[0]
            assert.deepEqual(token.resources, ['serviceaccounts/token'])
            assert.deepEqual(token.verbs, ['create'])
            // minting a token for anything but itself is not least privilege
            assert.deepEqual(token.resourceNames, ['kwirth-sa'])

            const rb = find('RoleBinding')
            assert.equal(rb.roleRef.kind, 'Role')
            assert.equal(rb.roleRef.name, manifest.role)
            assert.equal(rb.subjects[0].name, 'kwirth-sa')

            assert.equal(envOf().CHANNEL_METRICS, 'true')
        })

        test(`${name}: the strict alternative keeps BOTH kubelet subresources`, () => {
            // readNodeMetrics reads two paths and the kubelet authorizes them against different
            // subresources: /metrics/cadvisor -> nodes/metrics, /stats/summary -> nodes/stats.
            // Granting only the first does not degrade node metrics, it breaks them, because
            // readCAdvisorSummary throws on a non-ok response.
            const granted = asSet(strictRules(manifest.file))
            assert.ok(granted.has('/nodes/metrics'), 'missing nodes/metrics (/metrics/cadvisor)')
            assert.ok(granted.has('/nodes/stats'), 'missing nodes/stats (/stats/summary)')
        })
    }
    else {
        test(`${name}: no Role, no RoleBinding, not one verb that is not a read`, () => {
            assert.equal(find('Role'), undefined)
            assert.equal(find('RoleBinding'), undefined)
            assert.equal(envOf().CHANNEL_METRICS, 'false')
        })

        test(`${name}: the strict alternative leaves the kubelet subresources out`, () => {
            // without the token there is no reaching any kubelet, so granting these would be
            // permission for a call that never happens
            const granted = asSet(strictRules(manifest.file))
            assert.ok(!granted.has('/nodes/metrics'), 'nodes/metrics is unusable without the token rule')
            assert.ok(!granted.has('/nodes/stats'), 'nodes/stats is unusable without the token rule')

            // metrics.k8s.io is the other kind of metrics and it needs no token: it survives here
            assert.ok(granted.has('metrics.k8s.io/pods'), 'PodMetrics goes through the API server, it should stay')
            assert.ok(granted.has('metrics.k8s.io/nodes'), 'NodeMetrics goes through the API server, it should stay')
        })
    }
}

test('the two manifests grant the same thing; only the token rule separates them', () => {
    const crOf = (f) => load(f).find(d => d.kind === 'ClusterRole').rules
    assert.deepEqual(crOf('kwirth-readonly.yaml'), crOf('kwirth-full-ro.yaml'))

    // their strict alternatives may differ, and only by the two kubelet subresources
    const ro = asSet(strictRules('kwirth-readonly.yaml'))
    const full = asSet(strictRules('kwirth-full-ro.yaml'))
    assert.deepEqual([...ro].filter(r => !full.has(r)).sort(), ['/nodes/metrics', '/nodes/stats'])
    assert.deepEqual([...full].filter(r => !ro.has(r)), [], 'full-ro must not grant anything the readonly one does not')
})
