/*
    Unit tests of kwirth-readonly.yaml, the least-privilege manifest. They need nothing but node — no
    cluster, no helm.

    Two of them are just shape. The third is the one that earns its keep: it reads back/src, derives
    every Kubernetes resource the code actually calls, and asserts the ClusterRole grants it. A
    hand-written least-privilege role rots the moment someone adds an API call and nobody remembers
    the manifest; this fails the day it happens instead of the day a user hits a 403.

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
const manifest = path.resolve(here, '..', 'kwirth-readonly.yaml')
const yaml = createRequire(path.join(repoRoot, 'back', 'package.json'))('js-yaml')

const docs = yaml.loadAll(readFileSync(manifest, 'utf8')).filter(Boolean)
const find = (kind, name) => docs.find(d => d.kind === kind && (!name || d.metadata.name === name))

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

/*
    Reads that the role deliberately does not grant, each for a stated reason. Anything NOT on this
    list has to be in the ClusterRole, which is the whole point of the test.
*/
const UNGRANTED_READS = {
    'coreApi.listSecretForAllNamespaces': 'OPTIONAL block: cluster-wide secret read is off by default',
    'coreApi.listServiceAccountForAllNamespaces': 'OPTIONAL block: travels with secrets',
    'coreApi.readNamespacedSecret': 'own namespace only, granted by the Role'
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
    purpose, and the test below asserts they are NOT granted.
*/
const readCalls = () => {
    const calls = new Map()
    const clients = Object.keys(GROUP_OF_CLIENT).join('|')
    const re = new RegExp(`\\b(${clients})\\.(list|read)([A-Za-z]+)\\(`, 'g')
    for (const file of sourceFiles(path.join(repoRoot, 'back', 'src'))) {
        const text = readFileSync(file, 'utf8')
        let m
        while ((m = re.exec(text)) !== null) {
            const [, client, , rest] = m
            const key = `${client}.${m[2]}${rest}`
            if (rest === 'APIResources') continue   // discovery, never gated by RBAC
            const kind = rest.replace(/^Namespaced/, '').replace(/ForAllNamespaces$/, '')
            const resource = RESOURCE_OVERRIDE[key] ?? pluralize(kind)
            calls.set(key, `${GROUP_OF_CLIENT[client]}/${resource}`)
        }
    }
    return calls
}

test('the file is one applyable bundle of nine objects', () => {
    assert.deepEqual(docs.map(d => `${d.kind}/${d.metadata.name}`), [
        'Namespace/kwirth',
        'Secret/kwirth-users',
        'ServiceAccount/kwirth-sa',
        'ClusterRole/kwirth-readonly-cr',
        'ClusterRoleBinding/kwirth-readonly-crb',
        'Role/kwirth-store',
        'RoleBinding/kwirth-store-rb',
        'Deployment/kwirth',
        'Service/kwirth-svc'
    ])
})

test('the ClusterRole is read-only, with no wildcard anywhere', () => {
    const cr = find('ClusterRole')
    for (const rule of cr.rules) {
        for (const verb of rule.verbs) {
            assert.ok(['get', 'list', 'watch'].includes(verb), `cluster-wide verb '${verb}' on ${rule.resources}`)
        }
        for (const field of ['apiGroups', 'resources', 'verbs']) {
            assert.ok(!rule[field].includes('*'), `wildcard in ${field} of a rule on ${rule.resources}`)
        }
    }
})

test('the only writes are scoped to the kwirth namespace', () => {
    const role = find('Role', 'kwirth-store')
    assert.equal(role.metadata.namespace, 'kwirth')

    const writable = role.rules
        .filter(r => r.verbs.some(v => !['get', 'list', 'watch'].includes(v)))
        .flatMap(r => r.resources)
    assert.deepEqual(writable.sort(), ['configmaps', 'secrets', 'serviceaccounts/token'])

    // minting a token for anything but itself is not least privilege
    const token = role.rules.find(r => r.resources.includes('serviceaccounts/token'))
    assert.deepEqual(token.resourceNames, ['kwirth-sa'])
    assert.deepEqual(token.verbs, ['create'])

    const rb = find('RoleBinding', 'kwirth-store-rb')
    assert.equal(rb.roleRef.kind, 'Role')
    assert.equal(rb.subjects[0].name, 'kwirth-sa')
})

test('every resource the back reads is granted, and nothing the back writes is', () => {
    const cr = find('ClusterRole')
    const granted = new Set(cr.rules.flatMap(r => r.apiGroups.flatMap(g => r.resources.map(res => `${g}/${res}`))))

    const missing = []
    for (const [call, resource] of readCalls()) {
        if (granted.has(resource)) continue
        if (UNGRANTED_READS[call]) continue
        missing.push(`${call} needs '${resource}'`)
    }
    assert.deepEqual(missing, [], `the manifest does not cover what back/src calls:\n  ${missing.join('\n  ')}`)

    // the subresources that only exist spelled out, which 'resources: [*]' would have hidden
    for (const sub of ['/pods/log', '/pods/status', '/nodes/metrics', '/nodes/proxy']) {
        assert.ok(granted.has(sub), `missing subresource ${sub}`)
    }
    assert.ok(!granted.has('/pods/exec'), 'a read-only deployment must not grant pods/exec')
    assert.ok(!granted.has('/pods/eviction'), 'a read-only deployment must not grant pods/eviction')
})

test('the pod runs with no capability, no escalation and a read-only image', () => {
    const container = find('Deployment').spec.template.spec.containers[0]
    const sc = container.securityContext
    assert.equal(sc.allowPrivilegeEscalation, false)
    assert.equal(sc.readOnlyRootFilesystem, true)
    assert.deepEqual(sc.capabilities.drop, ['ALL'])
    assert.equal(sc.seccompProfile.type, 'RuntimeDefault')

    // readOnlyRootFilesystem only holds because everything written at runtime goes to os.tmpdir()
    const tmp = container.volumeMounts.find(v => v.mountPath === '/tmp')
    assert.ok(tmp, 'a read-only root filesystem needs a writable /tmp')
    assert.ok(find('Deployment').spec.template.spec.volumes.find(v => v.name === tmp.name).emptyDir)
})

test('only the two channel switches the back actually reads are set', () => {
    const env = find('Deployment').spec.template.spec.containers[0].env.map(e => e.name)
    assert.deepEqual(env.filter(n => n.startsWith('CHANNEL_')).sort(), ['CHANNEL_MAGNIFY', 'CHANNEL_METRICS'])
})
