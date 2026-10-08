/*
    e2e of the least-privilege manifest against a real cluster. The unit tests read the YAML; this one
    asks the API server, which is the only thing that settles what a role actually grants: a resource
    name with a typo parses fine, applies fine, and grants nothing.

    It is non-destructive. It applies ONLY the RBAC objects, into a throwaway namespace, under names
    that do not collide with an installed Kwirth, and deletes everything it created on the way out —
    including when an assertion fails. It never deploys the pod: 'kubectl auth can-i --as=' answers
    without anything running.

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
const manifest = path.resolve(here, '..', 'kwirth-readonly.yaml')
const yaml = createRequire(path.join(repoRoot, 'back', 'package.json'))('js-yaml')

const NS = 'kwirth-rbac-e2e'
const SA = `system:serviceaccount:${NS}:kwirth-sa`

const kubectl = (args, input) => execFileSync('kubectl', args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] }).trim()

const canI = (verb, resource, namespace, subresource) => {
    const args = ['auth', 'can-i', verb, resource, `--as=${SA}`]
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

let failures = 0
const check = (expected, verb, resource, namespace, subresource) => {
    const got = canI(verb, resource, namespace, subresource)
    const where = namespace ? `in ${namespace}` : 'cluster-wide'
    const what = subresource ? `${resource} --subresource=${subresource}` : resource
    const ok = got === expected
    if (!ok) failures++
    console.log(`${ok ? '  ok  ' : '  FAIL'}  ${expected ? 'can' : 'cannot'} ${verb} ${what} ${where}${ok ? '' : `  -> got ${got ? 'yes' : 'no'}`}`)
}

/*
    The manifest hardcodes the 'kwirth' namespace, which on most clusters is a real installation. The
    e2e rewrites it, so applying this can never touch one.
*/
const rbacForTest = () => {
    const docs = yaml.loadAll(readFileSync(manifest, 'utf8')).filter(Boolean)
    const wanted = ['Namespace', 'ServiceAccount', 'ClusterRole', 'ClusterRoleBinding', 'Role', 'RoleBinding']
    const rename = (name) => name.replace(/^kwirth-/, `${NS}-`)
    const out = docs.filter(d => wanted.includes(d.kind)).map(d => {
        const copy = JSON.parse(JSON.stringify(d))
        if (copy.kind === 'Namespace') {
            copy.metadata.name = NS
            return copy
        }
        if (copy.metadata.namespace) copy.metadata.namespace = NS
        // the ServiceAccount keeps its name: it is what the impersonated subject is built from
        if (copy.kind !== 'ServiceAccount') copy.metadata.name = rename(copy.metadata.name)
        if (copy.subjects) copy.subjects.forEach(s => { s.namespace = NS })
        if (copy.roleRef) copy.roleRef.name = rename(copy.roleRef.name)
        return copy
    })
    return out.map(d => yaml.dump(d)).join('---\n')
}

const cleanup = () => {
    for (const args of [
        ['delete', 'namespace', NS, '--ignore-not-found', '--wait=false'],
        ['delete', 'clusterrole', `${NS}-readonly-cr`, '--ignore-not-found'],
        ['delete', 'clusterrolebinding', `${NS}-readonly-crb`, '--ignore-not-found']
    ]) {
        try { kubectl(args) } catch { /* cleanup never fails the run */ }
    }
}

try {
    console.log(`context: ${kubectl(['config', 'current-context'])}`)
    cleanup()
    kubectl(['apply', '-f', '-'], rbacForTest())
    console.log(`applied the RBAC into '${NS}'\n`)

    console.log('what it must be able to do:')
    check(true, 'get', 'pods')
    check(true, 'list', 'pods')
    check(true, 'watch', 'pods')
    check(true, 'get', 'pods/log')
    check(true, 'list', 'namespaces')
    check(true, 'list', 'nodes')
    check(true, 'list', 'jobs.batch')
    check(true, 'list', 'deployments.apps')
    check(true, 'list', 'ingresses.networking.k8s.io')
    check(true, 'list', 'storageclasses.storage.k8s.io')
    check(true, 'list', 'priorityclasses.scheduling.k8s.io')
    check(true, 'list', 'runtimeclasses.node.k8s.io')
    check(true, 'get', 'nodes/metrics')
    check(true, 'get', 'nodes/proxy')

    console.log('\nwhat it must NOT be able to do:')
    check(false, 'create', 'pods/exec')
    check(false, 'create', 'pods/eviction')
    check(false, 'delete', 'pods')
    check(false, 'patch', 'deployments.apps')
    check(false, 'delete', 'namespaces')
    check(false, 'patch', 'nodes')
    check(false, 'create', 'jobs.batch')
    check(false, 'escalate', 'clusterroles.rbac.authorization.k8s.io')
    check(false, 'list', 'secrets')                 // the OPTIONAL block is off by default

    console.log('\nits own namespace, the only place it writes:')
    check(true, 'create', 'configmaps', NS)
    check(true, 'update', 'secrets', NS)
    // resourceNames scopes it: a token for itself, yes; for any other ServiceAccount, no
    check(true, 'create', 'serviceaccounts/kwirth-sa', NS, 'token')
    check(false, 'create', 'serviceaccounts/default', NS, 'token')

    console.log('\nand that write does not reach anywhere else:')
    check(false, 'create', 'configmaps', 'default')
    check(false, 'update', 'secrets', 'default')
}
finally {
    cleanup()
    console.log(`\ncleaned up '${NS}' and the two cluster-scoped objects`)
}

console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures})`)
process.exit(failures === 0 ? 0 : 1)
