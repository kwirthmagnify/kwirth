/*
    Prints kwirth-full-ro.yaml rewritten into another namespace, so it can be deployed BESIDE an
    existing Kwirth instead of on top of it.

        node deploy/kubernetes/manifests/tests/emit.mjs <namespace> [manifest] | kubectl apply -f -

    Why this exists. Trying the read-only role on an installation that is already there does not
    work: this deployment keeps its configuration on a PVC, and an installation that keeps it in the
    cluster (what kwirth.yaml does) would be left unable to write its own Secrets the moment the
    binding was repointed. The store and the RBAC go together, so the only honest way to try it is a
    second, separate instance.

    KWIRTH_IMAGE overrides the image, with imagePullPolicy IfNotPresent so a locally built one that
    is already on the node is used instead of being pulled. Testing the manifest against the image
    you actually build is the point; the published 'latest' is a different Kwirth.

        KWIRTH_IMAGE=kwirth:develop node ...emit.mjs kwirth-ro | kubectl apply -f -

    Namespaced objects move to the new namespace. Cluster-scoped ones (ClusterRole,
    ClusterRoleBinding) are renamed with the namespace as prefix, because there is only one of each
    name in a cluster and clobbering the real install's RBAC is exactly what this avoids.

    The command to remove it afterwards is printed on stderr, so it stays out of the pipe. Deleting
    the namespace deletes the PVC, and with it the users and every setting of that instance. That is
    the point of a throwaway.
*/
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..', '..', '..')
const yaml = createRequire(path.join(repoRoot, 'back', 'package.json'))('js-yaml')

const ns = process.argv[2]
const file = process.argv[3] ?? 'kwirth-full-ro.yaml'
if (!ns || ns === 'kwirth') {
    console.error('usage: node emit.mjs <namespace> [manifest]   (a namespace of its own, not "kwirth")')
    process.exit(1)
}

const CLUSTER_SCOPED = ['ClusterRole', 'ClusterRoleBinding']
const rename = (name) => name.replace(/^kwirth-/, `${ns}-`)

const docs = yaml.loadAll(readFileSync(path.resolve(here, '..', file), 'utf8')).filter(Boolean)
const out = docs.map(d => {
    const copy = JSON.parse(JSON.stringify(d))
    if (copy.kind === 'Namespace') {
        copy.metadata.name = ns
        return copy
    }
    if (copy.metadata.namespace) copy.metadata.namespace = ns
    if (CLUSTER_SCOPED.includes(copy.kind)) copy.metadata.name = rename(copy.metadata.name)
    if (copy.subjects) copy.subjects.forEach(s => { s.namespace = ns })
    if (copy.roleRef && CLUSTER_SCOPED.includes(copy.roleRef.kind)) copy.roleRef.name = rename(copy.roleRef.name)
    if (copy.kind === 'Deployment' && process.env.KWIRTH_IMAGE) {
        const container = copy.spec.template.spec.containers[0]
        container.image = process.env.KWIRTH_IMAGE
        container.imagePullPolicy = 'IfNotPresent'
    }
    return copy
})

process.stdout.write(out.map(d => yaml.dump(d)).join('---\n'))

// on stderr, so it does not end up in the pipe to kubectl: what to delete when you are done
const scoped = out.filter(d => CLUSTER_SCOPED.includes(d.kind)).map(d => `${d.kind.toLowerCase()} ${d.metadata.name}`)
console.error(`\n# ${file} -> namespace '${ns}'`)
console.error(`# to remove:  kubectl delete namespace ${ns}${scoped.map(s => `  &&  kubectl delete ${s}`).join('')}`)
