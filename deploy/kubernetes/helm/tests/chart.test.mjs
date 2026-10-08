/*
    Unit tests of the Kwirth Helm chart: everything is 'helm template' rendered into objects and asserted on
    VALUES, never on the presence of a resource alone. They need 'helm' on the PATH and nothing else — no
    cluster — which is also why the lookup-based behaviour of the users Secret (keep the live one on upgrade)
    is out of their reach: that one lives in the e2e run against a real cluster (see run-e2e.mjs).

    Run:  node --test deploy/helm/tests/chart.test.mjs
*/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..', '..', '..')
const chartDir = path.resolve(here, '..', 'kwirth')
const yaml = createRequire(path.join(repoRoot, 'back', 'package.json'))('js-yaml')
const chartMeta = yaml.load(readFileSync(path.join(chartDir, 'Chart.yaml'), 'utf8'))

const ADMIN_BLOB = 'eyJpZCI6ImFkbWluIiwibmFtZSI6Ik5pY2tsYXVzIFdpcnRoIiwicGFzc3dvcmQiOiJwYXNzd29yZCIsInJlc291cmNlcyI6ImNsdXN0ZXIsYWRtaW46Ojo6In0='

const helm = (args) => execFileSync('helm', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const render = (args = [], release = 'kwirth') => yaml.loadAll(helm(['template', release, chartDir, '-n', 'kwirth', ...args])).filter(Boolean)
const find = (docs, kind, name) => docs.find(d => d.kind === kind && (!name || d.metadata.name === name))
const container = (deployment) => deployment.spec.template.spec.containers[0]
const envOf = (deployment) => Object.fromEntries(container(deployment).env.map(e => [e.name, e.value]))

test('helm lint passes', () => {
    const out = helm(['lint', chartDir])
    assert.match(out, /0 chart\(s\) failed/)
})

test('defaults: the eight resources, with the 0.1.x names so upgrades keep working', () => {
    const docs = render()
    assert.deepEqual(docs.map(d => `${d.kind}/${d.metadata.name}`).sort(), [
        'ClusterRole/kwirth-cr',
        'ClusterRoleBinding/kwirth-crb',
        'ConfigMap/kwirth.keys',
        'Deployment/kwirth',
        'Secret/kwirth-masterkey',
        'Secret/kwirth-users',
        'Service/kwirth-svc',
        'ServiceAccount/kwirth-sa'
    ])
})

test('defaults: the image is pinned to appVersion, never latest', () => {
    const dep = find(render(), 'Deployment')
    assert.equal(container(dep).image, `kwirthmagnify/kwirth:${chartMeta.appVersion}`)
    assert.equal(container(dep).imagePullPolicy, 'IfNotPresent')
    assert.doesNotMatch(String(chartMeta.appVersion), /latest/)
})

test('defaults: the env is exactly what the core reads today', () => {
    const dep = find(render(), 'Deployment')
    const env = envOf(dep)
    assert.deepEqual(env, {
        ROOTPATH: '/kwirth',
        PORT: '3883',
        AUTH: 'kwirth',
        CHANNEL_METRICS: 'true',
        CHANNEL_MAGNIFY: 'true',
        METRICSINTERVAL: '15',
        BODYLIMIT: '8mb',
        KEEPALIVE: '65000',
        FRONT: 'true',
        ANSILOG: 'true',
        EXITLOG: 'true'
    })
    // the dead channel switches of 0.1.x must not come back
    for (const dead of ['CHANNEL_LOG', 'CHANNEL_ALERT', 'CHANNEL_OPS', 'CHANNEL_TRIVY', 'CHANNEL_ECHO', 'CHANNEL_FILEMAN']) assert.equal(env[dead], undefined, dead)
    // and the sensitive ones never travel inline
    assert.equal(env.MASTERKEY, undefined)
    assert.deepEqual(container(dep).envFrom, [{ secretRef: { name: 'kwirth-masterkey' } }])
})

/*
    MASTERKEY is generated, not shipped. It signs every access key and, with a filesystem store, derives
    the key the configuration is encrypted with, so a hardcoded default is a published password — and
    rotating it later is data loss, not a config change. It therefore lives in a Secret of its own that
    is kept on uninstall and looked up on every upgrade; the cluster half of that is in run-e2e.mjs,
    because 'helm template' has no cluster to look into.
*/
test('defaults: no env Secret at all, and a generated MASTERKEY in its own kept Secret', () => {
    const docs = render()
    // nothing to carry: the env Secret only exists for a license or an SQL password
    assert.equal(find(docs, 'Secret', 'kwirth-env'), undefined)

    const secret = find(docs, 'Secret', 'kwirth-masterkey')
    assert.equal(secret.metadata.annotations['helm.sh/resource-policy'], 'keep')
    assert.match(secret.stringData.MASTERKEY, /^[A-Za-z0-9]{40}$/)
    assert.notEqual(secret.stringData.MASTERKEY, 'Kwirth4Ever', 'the old hardcoded default must be gone')
})

test('a generated MASTERKEY is different every time, which is the point', () => {
    const one = find(render(), 'Secret', 'kwirth-masterkey').stringData.MASTERKEY
    const two = find(render(), 'Secret', 'kwirth-masterkey').stringData.MASTERKEY
    assert.notEqual(one, two)
})

// the bootstrap admin as the chart renders it, decoded
// the bootstrap admin as the chart renders it, decoded. The Secret key is base64url(id), the same way
// the core writes it (IdentityService.writeUsers), because an id can be an email and a Secret key
// cannot hold an @.
const secretKey = (id) => Buffer.from(id, 'utf8').toString('base64url')

/*
    Does this stored hash open with this password? Checked exactly as the core checks it: bcrypt against
    the SHA-256 the front end sends, never against the clear text. Asserting the shape of the hash would
    pass just as happily on a hash of the wrong thing.
*/
const bcryptjs = createRequire(path.join(repoRoot, 'back', 'package.json'))('bcryptjs')
const opensWith = (plain, stored) =>
    bcryptjs.compareSync(createHash('sha256').update(plain).digest('hex'), stored)
const adminUser = (docs, id = 'admin') => JSON.parse(Buffer.from(find(docs, 'Secret', 'kwirth-users').data[secretKey(id)], 'base64').toString())

test('defaults: users Secret has the fixed name the core reads, the bootstrap admin and is kept on uninstall', () => {
    const secret = find(render(), 'Secret', 'kwirth-users')
    assert.equal(secret.metadata.annotations['helm.sh/resource-policy'], 'keep')

    const user = adminUser(render())
    assert.equal(user.id, 'admin')
    assert.equal(user.name, 'Nicklaus Wirth')
    // both scopes, which is what makes it an administrator and not just a viewer
    assert.equal(user.resources, 'cluster,admin::::')
    // generated, not the published default every install used to share
    // stored HASHED, the way the login compares: bcrypt over the sha256 the front end sends
    assert.match(user.password, /^\$2[aby]\$/, 'the password must not be stored in clear text')
    assert.notEqual(user.password, 'password')
    assert.notEqual(Buffer.from(find(render(), 'Secret', 'kwirth-users').data[secretKey('admin')], 'base64').toString(), Buffer.from(ADMIN_BLOB, 'base64').toString())

    const keys = find(render(), 'ConfigMap', 'kwirth.keys')
    assert.equal(keys.metadata.annotations['helm.sh/resource-policy'], 'keep')
    assert.deepEqual(keys.data, { data: '[]' })
})

test('another release name: the users Secret is still kwirth-users (0.1.x named it after the release and nobody could log in)', () => {
    const docs = render([], 'observability')
    assert.ok(find(docs, 'Secret', 'kwirth-users'))
    assert.ok(find(docs, 'ConfigMap', 'kwirth.keys'))
    assert.ok(find(docs, 'Deployment', 'observability-kwirth'))
    assert.equal(find(docs, 'ClusterRoleBinding').subjects[0].name, 'observability-kwirth-sa')
})

test('defaults: RBAC is an explicit list of API groups, not cluster-admin', () => {
    const docs = render()
    const cr = find(docs, 'ClusterRole')
    assert.equal(cr.rules.length, 1)
    const groups = cr.rules[0].apiGroups
    assert.ok(!groups.includes('*'))
    for (const g of ['', 'apps', 'batch', 'metrics.k8s.io', 'apiextensions.k8s.io', 'aquasecurity.github.io']) assert.ok(groups.includes(g), g)
    assert.deepEqual(cr.rules[0].resources, ['*'])
    assert.deepEqual(cr.rules[0].verbs, ['*'])
    const crb = find(docs, 'ClusterRoleBinding')
    assert.equal(crb.roleRef.apiGroup, 'rbac.authorization.k8s.io')
    assert.equal(crb.roleRef.name, 'kwirth-cr')
    assert.deepEqual(crb.subjects, [{ kind: 'ServiceAccount', name: 'kwirth-sa', namespace: 'kwirth' }])
})

test('rbac: clusterAdmin, extra groups and extra rules', () => {
    const cr = find(render(['--set', 'kwirth.rbac.clusterAdmin=true']), 'ClusterRole')
    assert.deepEqual(cr.rules, [{ apiGroups: ['*'], resources: ['*'], verbs: ['*'] }])

    const cr2 = find(render(['--set', 'kwirth.rbac.extraApiGroups[0]=fleet.cattle.io', '--set', 'kwirth.rbac.extraRules[0].nonResourceURLs[0]=/metrics', '--set', 'kwirth.rbac.extraRules[0].verbs[0]=get']), 'ClusterRole')
    assert.ok(cr2.rules[0].apiGroups.includes('fleet.cattle.io'))
    assert.deepEqual(cr2.rules[1], { nonResourceURLs: ['/metrics'], verbs: ['get'] })

    const docs = render(['--set', 'kwirth.rbac.create=false'])
    assert.equal(find(docs, 'ClusterRole'), undefined)
    assert.equal(find(docs, 'ClusterRoleBinding'), undefined)
})

test('defaults: the Service selects on the release, not on every kwirth in the namespace', () => {
    const docs = render()
    const svc = find(docs, 'Service')
    assert.deepEqual(svc.spec.selector, { app: 'kwirth', 'app.kubernetes.io/name': 'kwirth', 'app.kubernetes.io/instance': 'kwirth' })
    assert.equal(svc.spec.type, 'ClusterIP')
    assert.deepEqual(svc.spec.ports, [{ name: 'kwirth-port', protocol: 'TCP', port: 3883, targetPort: 'kwirth' }])
    // the Deployment selector is the 0.1.x one: it is immutable, so it must not move
    const dep = find(docs, 'Deployment')
    assert.deepEqual(dep.spec.selector.matchLabels, svc.spec.selector)
})

test('defaults: probes hit /healthz on the named port, no Ingress, no PVC', () => {
    const docs = render()
    const c = container(find(docs, 'Deployment'))
    for (const p of ['startupProbe', 'readinessProbe', 'livenessProbe']) assert.deepEqual(c[p].httpGet, { path: '/healthz', port: 'kwirth' }, p)
    assert.equal(c.startupProbe.failureThreshold, 30)
    assert.deepEqual(c.ports, [{ name: 'kwirth', containerPort: 3883, protocol: 'TCP' }])
    assert.equal(find(docs, 'Ingress'), undefined)
    assert.equal(find(docs, 'PersistentVolumeClaim'), undefined)
    assert.equal(find(docs, 'Deployment').spec.strategy, undefined)
})

test('a 0.1.x values file still works: string image, nginx ingress, dead channels ignored', () => {
    const docs = render(['-f', path.join(repoRoot, 'test', 'helm-install-kwirth-values.yaml'), '--set', 'kwirth.sa.serviceAccount.annotations.eks\\.amazonaws\\.com/role-arn=arn:x'])
    const c = container(find(docs, 'Deployment'))
    assert.equal(c.image, 'kwirthmagnify/kwirth:develop')
    assert.equal(c.imagePullPolicy, 'Always')
    const env = envOf(find(docs, 'Deployment'))
    assert.equal(env.ROOTPATH, '/kwirth')
    assert.equal(env.CHANNEL_LOG, undefined)
    const ing = find(docs, 'Ingress')
    assert.equal(ing.spec.ingressClassName, 'nginx')
    assert.equal(ing.metadata.annotations['nginx.ingress.kubernetes.io/affinity'], 'cookie')
    assert.equal(ing.metadata.annotations['nginx.ingress.kubernetes.io/proxy-read-timeout'], '3600')
    assert.equal(ing.spec.tls, undefined)
    assert.equal(ing.spec.rules[0].host, 'localhost')
    assert.equal(ing.spec.rules[0].http.paths[0].path, '/kwirth')
    assert.equal(ing.spec.rules[0].http.paths[0].backend.service.name, 'kwirth-svc')
    assert.deepEqual(find(docs, 'ServiceAccount').metadata.annotations, { 'eks.amazonaws.com/role-arn': 'arn:x' })
})

test('ingress: nginx with tls, agic, generic', () => {
    const nginx = find(render(['--set', 'kwirth.ingress.enabled=true', '--set', 'kwirth.ingress.nginx.tls=true', '--set', 'kwirth.ingress.nginx.secret=my-cert', '--set', 'kwirth.ingress.hostname=k.example.com']), 'Ingress')
    assert.deepEqual(nginx.spec.tls, [{ secretName: 'my-cert', hosts: ['k.example.com'] }])

    const agic = find(render(['--set', 'kwirth.ingress.enabled=true', '--set', 'kwirth.ingress.controller=agic', '--set', 'kwirth.ingress.agic.privateip=true', '--set', 'kwirth.ingress.agic.timeout=600']), 'Ingress')
    assert.equal(agic.spec.ingressClassName, 'azure-application-gateway')
    assert.equal(agic.metadata.annotations['appgw.ingress.kubernetes.io/use-private-ip'], 'true')
    assert.equal(agic.metadata.annotations['appgw.ingress.kubernetes.io/request-timeout'], '600')
    assert.equal(agic.metadata.annotations['appgw.ingress.kubernetes.io/health-probe-path'], '/healthz')

    const generic = find(render(['--set', 'kwirth.ingress.enabled=true', '--set', 'kwirth.ingress.controller=generic', '--set', 'kwirth.ingress.className=traefik', '--set', 'kwirth.ingress.annotations.a=b', '--set', 'kwirth.ingress.tls[0].secretName=s', '--set', 'kwirth.ingress.tls[0].hosts[0]=h', '--set', 'kwirth.config.rootpath=']), 'Ingress')
    assert.equal(generic.spec.ingressClassName, 'traefik')
    assert.deepEqual(generic.metadata.annotations, { a: 'b' })
    assert.deepEqual(generic.spec.tls, [{ secretName: 's', hosts: ['h'] }])
    assert.equal(generic.spec.rules[0].http.paths[0].path, '/', 'an empty root path serves at /')

    // user annotations win over the controller defaults
    const over = find(render(['--set', 'kwirth.ingress.enabled=true', '--set', 'kwirth.ingress.annotations.nginx\\.ingress\\.kubernetes\\.io/proxy-read-timeout=10']), 'Ingress')
    assert.equal(over.metadata.annotations['nginx.ingress.kubernetes.io/proxy-read-timeout'], '10')
})

test('rootpath: normalised with a leading slash, empty means the root', () => {
    assert.equal(envOf(find(render(['--set', 'kwirth.config.rootpath=foo']), 'Deployment')).ROOTPATH, '/foo')
    assert.equal(envOf(find(render(['--set', 'kwirth.config.rootpath=']), 'Deployment')).ROOTPATH, '')
})

test('persistence: PVC, mount, KWIRTH_STORE and Recreate', () => {
    const docs = render(['--set', 'kwirth.persistence.enabled=true', '--set', 'kwirth.persistence.size=5Gi', '--set', 'kwirth.persistence.storageClass=fast'])
    const pvc = find(docs, 'PersistentVolumeClaim', 'kwirth-data')
    assert.equal(pvc.spec.resources.requests.storage, '5Gi')
    assert.equal(pvc.spec.storageClassName, 'fast')
    assert.equal(pvc.metadata.annotations['helm.sh/resource-policy'], 'keep')
    const dep = find(docs, 'Deployment')
    assert.deepEqual(dep.spec.strategy, { type: 'Recreate' })
    assert.equal(envOf(dep).KWIRTH_STORE, '/mnt/kwirth-data')
    assert.deepEqual(container(dep).volumeMounts, [{ name: 'kwirth-data', mountPath: '/mnt/kwirth-data' }])
    assert.deepEqual(dep.spec.template.spec.volumes, [{ name: 'kwirth-data', persistentVolumeClaim: { claimName: 'kwirth-data' } }])
})

test('persistence: an existing claim is mounted and no PVC is created', () => {
    const docs = render(['--set', 'kwirth.persistence.enabled=true', '--set', 'kwirth.persistence.existingClaim=mine'])
    assert.equal(find(docs, 'PersistentVolumeClaim'), undefined)
    assert.equal(find(docs, 'Deployment').spec.template.spec.volumes[0].persistentVolumeClaim.claimName, 'mine')
})

test('store: an explicit path wins, etcd means the cluster', () => {
    const a = find(render(['--set', 'kwirth.config.store=/data', '--set', 'kwirth.persistence.enabled=true']), 'Deployment')
    assert.equal(envOf(a).KWIRTH_STORE, '/data')
    const b = find(render(['--set', 'kwirth.config.store=etcd']), 'Deployment')
    assert.equal(envOf(b).KWIRTH_STORE, undefined)
    assert.equal(b.spec.template.spec.volumes, undefined)
})

test('sql: the connection goes to the env and the password to the Secret', () => {
    const docs = render(['--set', 'kwirth.sql.enabled=true', '--set', 'kwirth.sql.host=pg.db', '--set', 'kwirth.sql.port=5433', '--set', 'kwirth.sql.user=kwirth', '--set', 'kwirth.sql.password=pw', '--set', 'kwirth.sql.ssl=true', '--set', 'kwirth.sql.maintenanceDb=maint'])
    const env = envOf(find(docs, 'Deployment'))
    assert.equal(env.KWIRTH_SQL_CLIENT, 'pg')
    assert.equal(env.KWIRTH_SQL_HOST, 'pg.db')
    assert.equal(env.KWIRTH_SQL_PORT, '5433')
    assert.equal(env.KWIRTH_SQL_USER, 'kwirth')
    assert.equal(env.KWIRTH_SQL_SSL, 'true')
    assert.equal(env.KWIRTH_SQL_MAINTDB, 'maint')
    assert.equal(env.KWIRTH_SQL_PASSWORD, undefined)
    assert.deepEqual(find(docs, 'Secret', 'kwirth-env').stringData, { KWIRTH_SQL_PASSWORD: 'pw' })
})

test('license, cluster name, previous log lines, port and the other switches', () => {
    const docs = render(['--set', 'kwirth.config.license=LIC', '--set', 'kwirth.config.clusterName=prod-eu', '--set', 'kwirth.config.previousLogLines=200', '--set', 'kwirth.config.port=8080', '--set', 'kwirth.config.front=false', '--set', 'kwirth.config.auth=entraid', '--set', 'kwirth.config.masterkey=K', '--set', 'kwirth.service.port=80'])
    const dep = find(docs, 'Deployment')
    const env = envOf(dep)
    assert.equal(env.KWIRTH_CLUSTER_NAME, 'prod-eu')
    assert.equal(env.PREVIOUSLOGLINES, '200')
    assert.equal(env.PORT, '8080')
    assert.equal(env.FRONT, 'false')
    assert.equal(env.AUTH, 'entraid')
    assert.equal(container(dep).ports[0].containerPort, 8080)
    assert.deepEqual(find(docs, 'Secret', 'kwirth-env').stringData, { KWIRTH_LICENSE: 'LIC' })
    assert.deepEqual(find(docs, 'Secret', 'kwirth-masterkey').stringData, { MASTERKEY: 'K' })
    const svc = find(docs, 'Service')
    assert.equal(svc.spec.ports[0].port, 80)
    assert.equal(svc.spec.ports[0].targetPort, 'kwirth')
})

test('existingSecret: nothing sensitive is rendered, the pod reads yours', () => {
    const docs = render(['--set', 'kwirth.existingSecret=my-kwirth', '--set', 'kwirth.config.license=LIC'])
    assert.equal(find(docs, 'Secret', 'kwirth-env'), undefined)
    assert.deepEqual(container(find(docs, 'Deployment')).envFrom, [{ secretRef: { name: 'my-kwirth' } }])
})

test('extraEnv, extraEnvFrom, extraVolumes and extraVolumeMounts are passed through', () => {
    const docs = render(['--set', 'kwirth.extraEnv[0].name=OIDC_SECRET', '--set', 'kwirth.extraEnv[0].valueFrom.secretKeyRef.name=oidc', '--set', 'kwirth.extraEnv[0].valueFrom.secretKeyRef.key=secret', '--set', 'kwirth.extraEnvFrom[0].configMapRef.name=cm', '--set-json', 'kwirth.extraVolumes=[{"name":"v","emptyDir":{}}]', '--set', 'kwirth.extraVolumeMounts[0].name=v', '--set', 'kwirth.extraVolumeMounts[0].mountPath=/v'])
    const dep = find(docs, 'Deployment')
    const c = container(dep)
    assert.deepEqual(c.env.at(-1), { name: 'OIDC_SECRET', valueFrom: { secretKeyRef: { name: 'oidc', key: 'secret' } } })
    assert.deepEqual(c.envFrom, [{ secretRef: { name: 'kwirth-masterkey' } }, { configMapRef: { name: 'cm' } }])
    assert.deepEqual(c.volumeMounts, [{ name: 'v', mountPath: '/v' }])
    assert.deepEqual(dep.spec.template.spec.volumes, [{ name: 'v', emptyDir: {} }])
})

test('scheduling and pod options', () => {
    const docs = render(['--set', 'kwirth.replicas=2', '--set', 'kwirth.nodeSelector.disk=ssd', '--set', 'kwirth.tolerations[0].key=k', '--set', 'kwirth.priorityClassName=high', '--set', 'kwirth.podAnnotations.a=b', '--set', 'kwirth.podLabels.team=obs', '--set', 'kwirth.securityContext.runAsNonRoot=true', '--set', 'kwirth.podSecurityContext.fsGroup=1000', '--set', 'kwirth.imagePullSecrets[0].name=regcred', '--set', 'kwirth.image.repository=my.registry/kwirth', '--set', 'kwirth.image.tag=1.2.3', '--set', 'kwirth.image.pullPolicy=Always'])
    const dep = find(docs, 'Deployment')
    const spec = dep.spec.template.spec
    assert.equal(dep.spec.replicas, 2)
    assert.deepEqual(spec.nodeSelector, { disk: 'ssd' })
    assert.deepEqual(spec.tolerations, [{ key: 'k' }])
    assert.equal(spec.priorityClassName, 'high')
    assert.deepEqual(dep.spec.template.metadata.annotations, { a: 'b' })
    assert.equal(dep.spec.template.metadata.labels.team, 'obs')
    assert.deepEqual(container(dep).securityContext, { runAsNonRoot: true })
    assert.deepEqual(spec.securityContext, { fsGroup: 1000 })
    assert.deepEqual(spec.imagePullSecrets, [{ name: 'regcred' }])
    assert.equal(container(dep).image, 'my.registry/kwirth:1.2.3')
    assert.equal(container(dep).imagePullPolicy, 'Always')
})

test('users.bootstrap=false renders no users Secret; serviceAccount.create=false binds the given one', () => {
    const docs = render(['--set', 'kwirth.users.bootstrap=false', '--set', 'kwirth.serviceAccount.create=false', '--set', 'kwirth.serviceAccount.name=external-sa'])
    assert.equal(find(docs, 'Secret', 'kwirth-users'), undefined)
    assert.equal(find(docs, 'ServiceAccount'), undefined)
    assert.equal(find(docs, 'Deployment').spec.template.spec.serviceAccountName, 'external-sa')
    assert.equal(find(docs, 'ClusterRoleBinding').subjects[0].name, 'external-sa')
})

/*
    Mode 'readonly' (plan: plans/helm/PLAN.md, and plans/least-privilege for why the role is a wildcard).

    The mode is not just the ClusterRole: a read-only install that still kept its configuration in
    Secrets would come up healthy and lose the admin password on the first restart. So the pieces travel
    together, and the ones that would silently break it are refused at render time — which is the thing
    a chart can do that a plain manifest cannot.
*/

const RO = ['--set', 'kwirth.mode=readonly', '--set', 'kwirth.persistence.enabled=true']

const renderFails = (args, pattern) => {
    try {
        render(args)
        assert.fail(`expected the render to be refused: ${args.join(' ')}`)
    }
    catch (err) {
        assert.match(String(err.stderr ?? err.message ?? err), pattern)
    }
}

test('readonly: one rule, three verbs, and nothing else anywhere', () => {
    const docs = render(RO)
    const cr = find(docs, 'ClusterRole')
    assert.equal(cr.rules.length, 1)
    assert.deepEqual(cr.rules[0].apiGroups, ['*'])
    assert.deepEqual(cr.rules[0].resources, ['*'])
    // the whole safety of the wildcard: exec and eviction are 'create', so three read verbs deny them
    assert.deepEqual(cr.rules[0].verbs, ['get', 'list', 'watch'])

    // no namespaced Role is rendered in either mode; this pins that the mode did not grow one
    assert.equal(find(docs, 'Role'), undefined)
    assert.equal(find(docs, 'RoleBinding'), undefined)
})

test('readonly: apiGroups and extraApiGroups are ignored, the wildcard already covers them', () => {
    const cr = find(render([...RO, '--set', 'kwirth.rbac.extraApiGroups[0]=fleet.cattle.io']), 'ClusterRole')
    assert.equal(cr.rules.length, 1)
    assert.deepEqual(cr.rules[0].apiGroups, ['*'])
})

test('readonly: the store moves to the volume, and the pieces that depend on it follow', () => {
    const docs = render(RO)
    const dep = find(docs, 'Deployment')
    const env = envOf(dep)

    // the store is what removes the write permission, so it is not optional here
    assert.equal(env.KWIRTH_STORE, '/mnt/kwirth-data')
    assert.ok(find(docs, 'PersistentVolumeClaim'))
    // the crash log is a ConfigMap write this role cannot do
    assert.equal(env.EXITLOG, 'false')
    // with the store on a volume the core seeds its own admin; a Secret would be a second, stale truth
    assert.equal(find(docs, 'Secret', 'kwirth-users'), undefined)
})

test('readonly: a hardened securityContext by default, and /tmp to make it hold', () => {
    const dep = find(render(RO), 'Deployment')
    const sc = container(dep).securityContext
    assert.equal(sc.allowPrivilegeEscalation, false)
    assert.equal(sc.readOnlyRootFilesystem, true)
    assert.deepEqual(sc.capabilities.drop, ['ALL'])
    assert.equal(sc.seccompProfile.type, 'RuntimeDefault')

    // readOnlyRootFilesystem only holds because what the core writes at runtime goes to os.tmpdir()
    const mount = container(dep).volumeMounts.find(v => v.mountPath === '/tmp')
    assert.ok(mount, 'a read-only root filesystem needs a writable /tmp')
    assert.ok(dep.spec.template.spec.volumes.find(v => v.name === mount.name).emptyDir)
})

test('readonly: what the operator sets wins, whole', () => {
    const docs = render([...RO, '--set', 'kwirth.securityContext.runAsNonRoot=true', '--set', 'kwirth.config.exitLog=true', '--set', 'kwirth.users.bootstrap=true'])
    const dep = find(docs, 'Deployment')
    // not merged with the hardened default: replaced by it, which is what 'with' semantics promise
    assert.deepEqual(container(dep).securityContext, { runAsNonRoot: true })
    assert.equal(envOf(dep).EXITLOG, 'true')
    assert.ok(find(docs, 'Secret', 'kwirth-users'))
})

test('normal mode is untouched by any of this', () => {
    const dep = find(render(), 'Deployment')
    assert.equal(envOf(dep).EXITLOG, 'true')
    assert.equal(container(dep).securityContext, undefined)
    assert.ok(find(render(), 'Secret', 'kwirth-users'))
    assert.equal(find(render(), 'Deployment').spec.template.spec.volumes, undefined)
})

test('readonly refuses the combinations that would quietly undo it', () => {
    // no store: the install would come up and then be unable to keep anything
    renderFails(['--set', 'kwirth.mode=readonly'], /needs a store outside the cluster/)
    // saying both is saying opposite things
    renderFails([...RO, '--set', 'kwirth.rbac.clusterAdmin=true'], /contradicts kwirth.mode=readonly/)
    // extraRules are appended verbatim, so one write verb there undoes the whole mode
    renderFails([...RO, '--set', 'kwirth.rbac.extraRules[0].resources[0]=pods', '--set', 'kwirth.rbac.extraRules[0].verbs[0]=delete'], /grants the verb 'delete'/)
    // a typo in the mode must not silently install the permissive one
    renderFails(['--set', 'kwirth.mode=paranoid'], /must be 'normal' or 'readonly'/)
})

test('readonly still takes extra READ rules, which is what they are mostly for', () => {
    const cr = find(render([...RO, '--set', 'kwirth.rbac.extraRules[0].nonResourceURLs[0]=/metrics', '--set', 'kwirth.rbac.extraRules[0].verbs[0]=get']), 'ClusterRole')
    assert.equal(cr.rules.length, 2)
    assert.deepEqual(cr.rules[1], { nonResourceURLs: ['/metrics'], verbs: ['get'] })
})

test('readonly: an explicit store path is accepted instead of the chart PVC', () => {
    // somebody mounting their own volume through extraVolumes is a legitimate way to satisfy the guard
    const docs = render(['--set', 'kwirth.mode=readonly', '--set', 'kwirth.config.store=/data'])
    assert.equal(envOf(find(docs, 'Deployment')).KWIRTH_STORE, '/data')
    assert.equal(find(docs, 'PersistentVolumeClaim'), undefined)
})

/*
    The bootstrap admin password: generated on a first install and PRINTED, instead of a default that
    was the same on every Kwirth in the world and lived in a public values.yaml.
*/

test('the generated password is different every install', () => {
    assert.notEqual(adminUser(render()).password, adminUser(render()).password)
})

/*
    The three checks that need the NOTES — that the password PRINTED is the one STORED, and that
    nothing is printed when the operator supplied it — live in run-e2e.mjs. NOTES.txt is not part of
    'helm template' output, and 'helm install --dry-run' reaches the cluster to check ownership,
    which these tests promise not to do.
*/

test('a password you set is used instead of a generated one', () => {
    // not stored as given: hashed like any other, so the Secret never holds a password in the clear
    const stored = adminUser(render(['--set', 'kwirth.users.adminPassword=s3cr3t'])).password
    assert.notEqual(stored, 's3cr3t')
    assert.ok(opensWith('s3cr3t', stored), 'the hash does not verify against the password that was set')
})

test('the id and the name are yours to choose, and the Secret key follows the id', () => {
    const docs = render(['--set', 'kwirth.users.adminId=root', '--set', 'kwirth.users.adminName=Ada Lovelace'])
    const user = adminUser(docs, 'root')
    assert.equal(user.id, 'root')
    assert.equal(user.name, 'Ada Lovelace')
    assert.equal(find(docs, 'Secret', 'kwirth-users').data[secretKey('admin')], undefined)
})

test('a whole blob in users.admin wins over the three values above', () => {
    assert.equal(find(render(['--set', `kwirth.users.admin=${ADMIN_BLOB}`]), 'Secret', 'kwirth-users').data[secretKey('admin')], ADMIN_BLOB)
})

/*
    🔴 The id can be an email, and a Secret key can hold alphanumerics, '-', '_' and '.' and nothing
    else. Using the id as the key renders a Secret the API server refuses — an install that fails on
    apply, not on render, which is the worst place to find out.
*/
test('an id with characters a Secret key cannot hold still produces a legal key', () => {
    const docs = render(['--set', 'kwirth.users.adminId=ada@acme.com'])
    const [key] = Object.keys(find(docs, 'Secret', 'kwirth-users').data)
    assert.match(key, /^[A-Za-z0-9._-]+$/, `'${key}' is not a legal Secret key`)
    // and it is the SAME encoding the core uses, so both write the same place
    assert.equal(key, Buffer.from('ada@acme.com', 'utf8').toString('base64url'))
    assert.equal(adminUser(docs, 'ada@acme.com').id, 'ada@acme.com')
})
