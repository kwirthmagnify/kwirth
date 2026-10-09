/*
    e2e of the three deployment manifests against a real cluster. The unit tests read the YAML; this one
    asks the API server, which is the only thing that settles what a role actually grants: a resource
    name with a typo parses fine, applies fine, and grants nothing.

        kwirth.yaml            it manages the cluster — and this proves it really can
        kwirth-full-ro.yaml    it watches the cluster — read everything, change nothing
        kwirth-zero.yaml       nothing at all — asserted from the only angle there is, the default
                               ServiceAccount it falls back to, which must be able to do nothing

    It is non-destructive. It applies ONLY the RBAC objects, into throwaway namespaces, under names
    that do not collide with an installed Kwirth, and deletes everything it created on the way out —
    including when an assertion fails. It never deploys a pod: 'kubectl auth can-i --as=' answers
    without anything running.

    🔴 Subresources MUST go through --subresource. 'can-i get pods/log' asks about the pod NAMED 'log',
    which 'get pods' already allows, so such a check passes whether the grant exists or not. Three of
    these were green for that reason until 'nodes/proxy' answered an impossible yes.

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

const CLUSTER_SCOPED = ['ClusterRole', 'ClusterRoleBinding']

const kubectl = (args, input) => execFileSync('kubectl', args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] }).trim()

let failures = 0

const makeCheck = (subject) => {
    const canI = (verb, resource, namespace, subresource) => {
        const args = ['auth', 'can-i', verb, resource, `--as=${subject}`]
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
    return (expected, verb, resource, namespace, subresource) => {
        const got = canI(verb, resource, namespace, subresource)
        const where = namespace ? `in ${namespace}` : 'cluster-wide'
        const what = subresource ? `${resource} --subresource=${subresource}` : resource
        const ok = got === expected
        if (!ok) failures++
        console.log(`${ok ? '  ok  ' : '  FAIL'}  ${expected ? 'can' : 'cannot'} ${verb} ${what} ${where}${ok ? '' : `  -> got ${got ? 'yes' : 'no'}`}`)
    }
}

/*
    A handful of the cluster's own CustomResourceDefinitions, as '<plural>.<group>'. This is the case
    the read-only wildcard exists for: the events provider opens a watcher per CRD it sees appear, so
    whatever this particular cluster happens to have must be readable. Capped, because every check is a
    round trip and the point is made with a few.
*/
const crdResources = () => {
    try {
        return kubectl(['get', 'crd', '-o', 'jsonpath={range .items[*]}{.spec.names.plural}.{.spec.group}{"\\n"}{end}'])
            .split('\n').map(s => s.trim()).filter(Boolean).slice(0, 6)
    }
    catch {
        return []   // a cluster with no CRDs is a fine cluster
    }
}

/*
    The manifests hardcode the 'kwirth' namespace, which on most clusters is a real installation. Each
    run rewrites it, so applying this can never touch one. Only the RBAC objects are applied: no pod is
    deployed, and the Secrets and volumes of a real install are never recreated.
*/
const rbacForTest = (file, ns) => {
    const rename = (name) => name.replace(/^kwirth-/, `${ns}-`)
    const docs = yaml.loadAll(readFileSync(path.resolve(here, '..', file), 'utf8')).filter(Boolean)
    const wanted = ['Namespace', 'ServiceAccount', 'ClusterRole', 'ClusterRoleBinding', 'Role', 'RoleBinding']
    const clusterScoped = []
    const out = docs.filter(d => wanted.includes(d.kind)).map(d => {
        const copy = JSON.parse(JSON.stringify(d))
        if (copy.kind === 'Namespace') {
            copy.metadata.name = ns
            return copy
        }
        if (copy.metadata.namespace) copy.metadata.namespace = ns
        // the ServiceAccount keeps its name: it is what the impersonated subject is built from
        if (CLUSTER_SCOPED.includes(copy.kind)) {
            copy.metadata.name = rename(copy.metadata.name)
            clusterScoped.push(`${copy.kind.toLowerCase()}/${copy.metadata.name}`)
        }
        if (copy.subjects) copy.subjects.forEach(s => { s.namespace = ns })
        if (copy.roleRef && CLUSTER_SCOPED.includes(copy.roleRef.kind)) copy.roleRef.name = rename(copy.roleRef.name)
        return copy
    })
    // a Namespace is always rendered, even when the manifest declares no RBAC at all: the zero case
    // still needs somewhere to ask about its default ServiceAccount
    if (!out.some(d => d.kind === 'Namespace')) out.unshift({ apiVersion: 'v1', kind: 'Namespace', metadata: { name: ns } })
    return { yaml: out.map(d => yaml.dump(d)).join('---\n'), clusterScoped }
}

const run = ({ file, ns, subject, checks }) => {
    const { yaml: rbac, clusterScoped } = rbacForTest(file, ns)
    const check = makeCheck(subject(ns))

    const cleanup = () => {
        const targets = [['delete', 'namespace', ns, '--ignore-not-found', '--wait=false']]
        for (const ref of clusterScoped) targets.push(['delete', ref, '--ignore-not-found'])
        for (const args of targets) {
            try { kubectl(args) } catch { /* cleanup never fails the run */ }
        }
    }

    console.log(`\n${'='.repeat(90)}\n${file}  ->  namespace '${ns}'\n${'='.repeat(90)}`)
    try {
        cleanup()
        kubectl(['apply', '-f', '-'], rbac)
        checks(check, ns)
    }
    finally {
        cleanup()
        console.log(`\ncleaned up '${ns}' and ${clusterScoped.length} cluster-scoped objects`)
    }
}

console.log(`context: ${kubectl(['config', 'current-context'])}`)

// ── kwirth.yaml — it manages the cluster ───────────────────────────────────────────────────────────

run({
    file: 'kwirth.yaml',
    ns: 'kwirth-full-e2e',
    subject: (ns) => `system:serviceaccount:${ns}:kwirth-sa`,
    checks: (check) => {
        /*
            Asserted from the other side for once: this manifest's job is that everything WORKS, and
            the actions below are exactly what the read-only one gives up. If these ever start
            answering no, the ops and fileman plugins and the Magnify commands stopped working and
            nothing else would have told us.
        */
        console.log('\nwhat the permissive deployment is for:')
        check(true, 'create', 'pods', null, 'exec')
        check(true, 'delete', 'pods')
        check(true, 'patch', 'deployments.apps')
        check(true, 'create', 'jobs.batch')
        check(true, 'get', 'pods', null, 'log')
        check(true, 'get', 'nodes', null, 'metrics')
        check(true, 'get', 'nodes', null, 'stats')
        // the three groups that used to be missing: the Magnify tree 403'd on them in silence
        check(true, 'list', 'runtimeclasses.node.k8s.io')
        check(true, 'list', 'priorityclasses.scheduling.k8s.io')
        check(true, 'list', 'validatingwebhookconfigurations.admissionregistration.k8s.io')
        // without batch the resource selector loses EVERY controller, not just jobs
        check(true, 'list', 'jobs.batch')
    }
})

// ── kwirth-full-ro.yaml — it watches the cluster ───────────────────────────────────────────────────

run({
    file: 'kwirth-full-ro.yaml',
    ns: 'kwirth-fullro-e2e',
    subject: (ns) => `system:serviceaccount:${ns}:kwirth-sa`,
    checks: (check, ns) => {
        console.log('\nwhat it must be able to do:')
        check(true, 'get', 'pods')
        check(true, 'list', 'pods')
        check(true, 'watch', 'pods')
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
        // the reason the rule is a wildcard: the events provider watches every CRD it sees appear
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
        check(false, 'create', 'configmaps', ns)
        check(false, 'update', 'configmaps', ns)
        check(false, 'create', 'secrets', ns)
        check(false, 'update', 'secrets', ns)
        // the token is READ from the projection the kubelet mounts, never minted, which is what let
        // the namespaced Role disappear from the manifest
        check(false, 'create', 'serviceaccounts/kwirth-sa', ns, 'token')

        console.log('\nthe acknowledged price of the wildcard, asserted so it is never a surprise:')
        // RBAC cannot subtract: there is no "every group except the core one" and no deny rule
        check(true, 'list', 'secrets')
    }
})

// ── kwirth-zero.yaml — it does not know it is in a cluster ─────────────────────────────────────────

run({
    file: 'kwirth-zero.yaml',
    ns: 'kwirth-zero-e2e',
    /*
        There is no ServiceAccount of its own to impersonate — that IS the manifest. So the subject is
        the namespace's 'default', which is what the pod runs as, and the assertion is that it can do
        nothing. Belt and braces on top of that, the pod turns the projected token off, so there is not
        even a credential inside the container to use these non-permissions with; the unit tests pin
        that half, because it is a pod spec and not an API answer.
    */
    subject: (ns) => `system:serviceaccount:${ns}:default`,
    checks: (check, ns) => {
        console.log('\nthe default ServiceAccount it falls back to can do NOTHING:')
        check(false, 'get', 'pods')
        check(false, 'list', 'pods')
        check(false, 'watch', 'pods')
        check(false, 'get', 'pods', null, 'log')
        check(false, 'list', 'namespaces')
        check(false, 'list', 'nodes')
        check(false, 'list', 'secrets')
        check(false, 'list', 'deployments.apps')
        check(false, 'create', 'pods', null, 'exec')
        check(false, 'delete', 'pods')
        // not even inside its own namespace, which is where a stray RoleBinding would show up
        check(false, 'get', 'configmaps', ns)
        check(false, 'create', 'configmaps', ns)
        check(false, 'get', 'secrets', ns)
    }
})

console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures})`)
process.exit(failures === 0 ? 0 : 1)
