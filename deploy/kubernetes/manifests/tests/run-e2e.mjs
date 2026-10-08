/*
    e2e of kwirth-full-ro.yaml against a real cluster. The unit tests read the YAML; this one asks
    the API server, which is the only thing that settles what a role actually grants: a resource
    name with a typo parses fine, applies fine, and grants nothing.

    It is non-destructive. It applies ONLY the RBAC objects, into a throwaway namespace, under names
    that do not collide with an installed Kwirth, and deletes everything it created on the way out —
    including when an assertion fails. It never deploys the pod: 'kubectl auth can-i --as=' answers
    without anything running.

    🔴 Subresources MUST go through --subresource. 'can-i get pods/log' asks about the pod NAMED
    'log', which 'get pods' already allows, so such a check passes whether the grant exists or not.
    Three of these were green for that reason until 'nodes/proxy' answered an impossible yes.

    Needs: kubectl on the PATH and a current context with permission to create RBAC and impersonate.

    Run:  node deploy/kubernetes/manifests/tests/run-e2e.mjs
*/
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..', '..', '..')
const yaml = createRequire(path.join(repoRoot, 'back', 'package.json'))('js-yaml')

const MANIFEST = 'kwirth-full-ro.yaml'
const NS = 'kwirth-fullro-e2e'
const SUBJECT = `system:serviceaccount:${NS}:kwirth-sa`
const CLUSTER_SCOPED = ['ClusterRole', 'ClusterRoleBinding']

const kubectl = (args, input) => execFileSync('kubectl', args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] }).trim()

let failures = 0

const canI = (verb, resource, namespace, subresource) => {
    const args = ['auth', 'can-i', verb, resource, `--as=${SUBJECT}`]
    if (subresource) args.push(`--subresource=${subresource}`)
    if (namespace) args.push('-n', namespace)
    else args.push('--all-namespaces')
    try {
        return kubectl(args) === 'yes'
    }
    catch (err) {
        // can-i exits 1 on 'no', which is an answer, not a failure
        return String(err.stdout ?? '').trim() === 'yes'
    }
}

const check = (expected, verb, resource, namespace, subresource) => {
    const got = canI(verb, resource, namespace, subresource)
    const where = namespace ? `in ${namespace}` : 'cluster-wide'
    const what = subresource ? `${resource} --subresource=${subresource}` : resource
    const ok = got === expected
    if (!ok) failures++
    console.log(`${ok ? '  ok  ' : '  FAIL'}  ${expected ? 'can' : 'cannot'} ${verb} ${what} ${where}${ok ? '' : `  -> got ${got ? 'yes' : 'no'}`}`)
}

/*
    A handful of the cluster's own CustomResourceDefinitions, as '<plural>.<group>'. This is the
    case the wildcard exists for: the events provider opens a watcher per CRD it sees appear, so
    whatever this particular cluster happens to have must be readable. Capped, because every check
    is a round trip and the point is made with a few.
*/
const crdResources = () => {
    let out = []
    try {
        out = kubectl(['get', 'crd', '-o', 'jsonpath={range .items[*]}{.spec.names.plural}.{.spec.group}{"\\n"}{end}'])
            .split('\n').map(s => s.trim()).filter(Boolean)
    }
    catch { /* a cluster with no CRDs is a fine cluster */ }
    return out.slice(0, 6)
}

/*
    The manifest hardcodes the 'kwirth' namespace, which on most clusters is a real installation.
    The run rewrites it, so applying this can never touch one.
*/
const rbacForTest = () => {
    const rename = (name) => name.replace(/^kwirth-/, `${NS}-`)
    const docs = yaml.loadAll(readFileSync(path.resolve(here, '..', MANIFEST), 'utf8')).filter(Boolean)
    const wanted = ['Namespace', 'ServiceAccount', 'ClusterRole', 'ClusterRoleBinding']
    const clusterScoped = []
    const out = docs.filter(d => wanted.includes(d.kind)).map(d => {
        const copy = JSON.parse(JSON.stringify(d))
        if (copy.kind === 'Namespace') {
            copy.metadata.name = NS
            return copy
        }
        if (copy.metadata.namespace) copy.metadata.namespace = NS
        // the ServiceAccount keeps its name: it is what the impersonated subject is built from
        if (CLUSTER_SCOPED.includes(copy.kind)) {
            copy.metadata.name = rename(copy.metadata.name)
            clusterScoped.push(`${copy.kind.toLowerCase()}/${copy.metadata.name}`)
        }
        if (copy.subjects) copy.subjects.forEach(s => { s.namespace = NS })
        if (copy.roleRef && CLUSTER_SCOPED.includes(copy.roleRef.kind)) copy.roleRef.name = rename(copy.roleRef.name)
        return copy
    })
    return { yaml: out.map(d => yaml.dump(d)).join('---\n'), clusterScoped }
}

const { yaml: rbac, clusterScoped } = rbacForTest()

const cleanup = () => {
    const targets = [['delete', 'namespace', NS, '--ignore-not-found', '--wait=false']]
    for (const ref of clusterScoped) targets.push(['delete', ref, '--ignore-not-found'])
    for (const args of targets) {
        try { kubectl(args) } catch { /* cleanup never fails the run */ }
    }
}

console.log(`context: ${kubectl(['config', 'current-context'])}`)
console.log(`${MANIFEST}  ->  namespace '${NS}'`)

try {
    cleanup()
    kubectl(['apply', '-f', '-'], rbac)

    console.log('\nwhat it must be able to do:')
    check(true, 'get', 'pods')
    check(true, 'list', 'pods')
    check(true, 'watch', 'pods')
    // 🔴 subresources MUST go through --subresource: see the header
    check(true, 'get', 'pods', null, 'log')
    check(true, 'get', 'pods', null, 'status')
    check(true, 'list', 'namespaces')
    check(true, 'list', 'nodes')
    check(true, 'list', 'jobs.batch')
    check(true, 'list', 'deployments.apps')
    check(true, 'list', 'ingresses.networking.k8s.io')
    check(true, 'list', 'storageclasses.storage.k8s.io')
    check(true, 'list', 'priorityclasses.scheduling.k8s.io')
    check(true, 'list', 'runtimeclasses.node.k8s.io')
    check(true, 'list', 'pods.metrics.k8s.io')
    check(true, 'list', 'nodes.metrics.k8s.io')
    // the two kubelet paths readNodeMetrics reads, authorized against different subresources
    check(true, 'get', 'nodes', null, 'metrics')
    check(true, 'get', 'nodes', null, 'stats')
    // the reason the rule is a wildcard: the events provider watches every CRD it sees appear,
    // and a cluster's CRDs are not knowable when the manifest is written
    for (const crd of crdResources()) check(true, 'watch', crd)

    console.log('\nwhat it must NOT be able to do:')
    check(false, 'create', 'pods', null, 'exec')
    check(false, 'create', 'pods', null, 'eviction')
    check(false, 'delete', 'pods')
    check(false, 'patch', 'deployments.apps')
    check(false, 'delete', 'namespaces')
    check(false, 'patch', 'nodes')
    check(false, 'create', 'jobs.batch')
    check(false, 'escalate', 'clusterroles.rbac.authorization.k8s.io')
    check(false, 'update', 'secrets')
    check(false, 'delete', 'customresourcedefinitions.apiextensions.k8s.io')

    console.log('\nnot one write, not even in its own namespace, and not even its own token:')
    check(false, 'create', 'configmaps', NS)
    check(false, 'update', 'configmaps', NS)
    check(false, 'create', 'secrets', NS)
    check(false, 'update', 'secrets', NS)
    // the token is READ from the projection the kubelet mounts, never minted, which is what let the
    // namespaced Role disappear from the manifest
    check(false, 'create', 'serviceaccounts/kwirth-sa', NS, 'token')
    check(false, 'create', 'serviceaccounts', NS)

    console.log('\nthe acknowledged price of the wildcard, asserted so it is never a surprise:')
    // RBAC cannot subtract: there is no "every group except the core one" and no deny rule. The
    // header says this out loud; the test makes sure the header stays true.
    check(true, 'list', 'secrets')
}
finally {
    cleanup()
    console.log(`\ncleaned up '${NS}' and ${clusterScoped.length} cluster-scoped objects`)
}

console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures})`)
process.exit(failures === 0 ? 0 : 1)
