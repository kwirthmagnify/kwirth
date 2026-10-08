/*
    Prints ONLY the RBAC objects of kwirth-readonly.yaml (ClusterRole, Role, RoleBinding), so the new
    role can be tried on an install that already exists without touching its users Secret, its
    Deployment or its Service — which is what applying the whole file would do.

    The ClusterRoleBinding is left out on purpose. An install already has one ('kwirth-crb'), and
    bindings UNION: adding a second one next to the permissive role changes nothing. To actually try
    the read-only role you repoint the binding that is already there, and put it back afterwards.

        node deploy/kubernetes/manifests/tests/emit-rbac.mjs | kubectl apply -f -
        kubectl delete clusterrolebinding kwirth-crb
        kubectl create clusterrolebinding kwirth-crb --clusterrole=kwirth-readonly-cr --serviceaccount=kwirth:kwirth-sa
        kubectl rollout restart deployment/kwirth -n kwirth

    roleRef is immutable, so there is no patching it: the binding is deleted and made again. Between
    the two commands the ServiceAccount has no cluster permissions at all, which is harmless because
    Kwirth is restarted right after anyway.

    To go back:

        kubectl delete clusterrolebinding kwirth-crb
        kubectl create clusterrolebinding kwirth-crb --clusterrole=kwirth-cr --serviceaccount=kwirth:kwirth-sa
        kubectl delete clusterrole kwirth-readonly-cr
        kubectl delete role kwirth-store -n kwirth
        kubectl delete rolebinding kwirth-store-rb -n kwirth
*/
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..', '..', '..')
const yaml = createRequire(path.join(repoRoot, 'back', 'package.json'))('js-yaml')

const docs = yaml.loadAll(readFileSync(path.resolve(here, '..', 'kwirth-readonly.yaml'), 'utf8')).filter(Boolean)
const wanted = ['ClusterRole', 'Role', 'RoleBinding']
process.stdout.write(docs.filter(d => wanted.includes(d.kind)).map(d => yaml.dump(d)).join('---\n'))
