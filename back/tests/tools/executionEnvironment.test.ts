import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EClusterType, EExecutionEnvironment } from '@kwirthmagnify/kwirth-common'
import { EStoreKind, IEnvironmentProbes, detectExecutionEnvironment, probeAzureIdentityEndpoint, resolveEnvironmentCapabilities, resolveClusterType, hasKubeconfigSource } from '../../src/tools/ExecutionEnvironment'
import os from 'os'
import path from 'path'
import http from 'http'
import { AddressInfo } from 'net'

/*
    The Azure probe is ALWAYS injected in these tests: the default one goes to 169.254.169.254, and a test
    must never depend on the network of the machine that runs it (on an Azure VM it would answer).
*/
const notAzure = async (): Promise<boolean> => false
const isAzure = async (): Promise<boolean> => true

/*
    The variables that decide the environment. They are cleared before each case because the test process
    inherits them from the shell, and a KWIRTH_STORE set on the machine of whoever runs this would change
    the result.
*/
const VARIABLES = ['FORCE', 'KUBERNETES_SERVICE_HOST', 'ECS_CONTAINER_METADATA_URI_V4', 'ECS_CONTAINER_METADATA_URI', 'K_SERVICE', 'KWIRTH_STORE', 'KWIRTH_CLUSTER_NAME']

/*
    Always async and awaiting the case. If the finally ran on RETURNING the promise instead of on
    resolving it, the variables would be restored before the case had read them: resolveStore consults
    KWIRTH_STORE after the first internal await, so the test would pass or fail depending on the
    environment of whoever runs it, which is the worst kind of test.
*/
const conEntorno = async (valores:{ [nombre:string]:string }, caso:() => Promise<void>|void): Promise<void> => {
    const previas:{ [nombre:string]:string|undefined } = {}
    for (let nombre of VARIABLES) {
        previas[nombre] = process.env[nombre]
        delete process.env[nombre]
    }
    for (let nombre of Object.keys(valores)) process.env[nombre] = valores[nombre]
    try {
        await caso()
    }
    finally {
        for (let nombre of VARIABLES) {
            if (previas[nombre] === undefined) delete process.env[nombre]
            else process.env[nombre] = previas[nombre]
        }
    }
}

const probes = (kubeconfig:boolean): IEnvironmentProbes => ({
    kubeconfig: () => kubeconfig
})

// ── detecting the environment ──────────────────────────────────────────────────────────────────────

test('FORCE manda sobre cualquier otra senal', async () => {
    await conEntorno({ FORCE: 'ecs', KUBERNETES_SERVICE_HOST: '10.0.0.1' }, async () => {
        assert.equal(await detectExecutionEnvironment(notAzure), EExecutionEnvironment.ECS)
    })
    await conEntorno({ FORCE: 'k8s' }, async () => {
        assert.equal(await detectExecutionEnvironment(notAzure), EExecutionEnvironment.KUBERNETES)
    })
    await conEntorno({ FORCE: 'docker' }, async () => {
        assert.equal(await detectExecutionEnvironment(notAzure), EExecutionEnvironment.DOCKER)
    })
    await conEntorno({ FORCE: 'desktop' }, async () => {
        assert.equal(await detectExecutionEnvironment(notAzure), EExecutionEnvironment.DESKTOP)
    })
    await conEntorno({ FORCE: 'cloudrun' }, async () => {
        assert.equal(await detectExecutionEnvironment(notAzure), EExecutionEnvironment.CLOUD_RUN)
    })
    await conEntorno({ FORCE: 'aci' }, async () => {
        assert.equal(await detectExecutionEnvironment(notAzure), EExecutionEnvironment.ACI)
    })
})

test('dentro de un pod, el entorno es Kubernetes', async () => {
    await conEntorno({ KUBERNETES_SERVICE_HOST: '10.0.0.1' }, async () => {
        assert.equal(await detectExecutionEnvironment(notAzure), EExecutionEnvironment.KUBERNETES)
    })
})

test('el metadata del agente de ECS identifica el entorno, en los dos launch types', async () => {
    await conEntorno({ ECS_CONTAINER_METADATA_URI_V4: 'http://169.254.170.2/v4/abc' }, async () => {
        assert.equal(await detectExecutionEnvironment(notAzure), EExecutionEnvironment.ECS)
    })
    // the variable without '_V4' belongs to the old agent, and it counts too
    await conEntorno({ ECS_CONTAINER_METADATA_URI: 'http://169.254.170.2/v3/abc' }, async () => {
        assert.equal(await detectExecutionEnvironment(notAzure), EExecutionEnvironment.ECS)
    })
})

test('K_SERVICE (contrato de Cloud Run) identifica Cloud Run', async () => {
    await conEntorno({ K_SERVICE: 'kwirth' }, async () => {
        assert.equal(await detectExecutionEnvironment(notAzure), EExecutionEnvironment.CLOUD_RUN)
    })
})

test('sin ninguna senal barata, el endpoint de identidad de Azure decide si es ACI', async () => {
    await conEntorno({}, async () => {
        assert.equal(await detectExecutionEnvironment(isAzure), EExecutionEnvironment.ACI)
    })
})

test('sin ninguna senal y sin Azure, el entorno no se detecta', async () => {
    await conEntorno({}, async () => {
        assert.equal(await detectExecutionEnvironment(notAzure), undefined)
    })
})

test('la sonda de Azure (la unica que cuesta tiempo) NO se llama si una senal barata ya caso', async () => {
    let calls = 0
    const counting = async (): Promise<boolean> => { calls++; return true }
    for (const valores of [{ KUBERNETES_SERVICE_HOST: '10.0.0.1' }, { ECS_CONTAINER_METADATA_URI_V4: 'http://x' }, { K_SERVICE: 'kwirth' }, { FORCE: 'docker' }]) {
        await conEntorno(valores, async () => { await detectExecutionEnvironment(counting) })
    }
    assert.equal(calls, 0)
})

// ── the Azure identity endpoint probe, against a local server playing each cloud ───────────────────

const conServidor = async (handler: (req: http.IncomingMessage, res: http.ServerResponse) => void, caso: (url: string) => Promise<void>): Promise<void> => {
    const server = http.createServer(handler)
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/metadata/identity/oauth2/token`
    try { await caso(url) }
    finally { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())) }
}

test('Azure con identidad gestionada (200 + token) es Azure, y la sonda manda la cabecera Metadata', async () => {
    let metadataHeader: string | undefined
    await conServidor((req, res) => { metadataHeader = req.headers['metadata'] as string; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"access_token":"x"}') }, async url => {
        assert.equal(await probeAzureIdentityEndpoint(url, 1000), true)
    })
    assert.equal(metadataHeader, 'true')
})

test('Azure SIN identidad gestionada (400 con su error JSON) tambien es Azure', async () => {
    await conServidor((_req, res) => { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end('{"error":"invalid_request","error_description":"Identity not found"}') }, async url => {
        assert.equal(await probeAzureIdentityEndpoint(url, 1000), true)
    })
})

test('el IMDS de EC2 en la misma IP (404 en esa ruta) NO es Azure', async () => {
    await conServidor((_req, res) => { res.writeHead(404, { 'Content-Type': 'text/html' }); res.end('<html>404 - Not Found</html>') }, async url => {
        assert.equal(await probeAzureIdentityEndpoint(url, 1000), false)
    })
})

test('el metadata server de GCP en la misma IP (403 sin su cabecera) NO es Azure', async () => {
    await conServidor((_req, res) => { res.writeHead(403, { 'Content-Type': 'text/html' }); res.end('Missing Metadata-Flavor:Google header.') }, async url => {
        assert.equal(await probeAzureIdentityEndpoint(url, 1000), false)
    })
})

test('un 400 que no es el JSON de Azure NO es Azure', async () => {
    await conServidor((_req, res) => { res.writeHead(400, { 'Content-Type': 'text/plain' }); res.end('bad request') }, async url => {
        assert.equal(await probeAzureIdentityEndpoint(url, 1000), false)
    })
})

test('si nadie contesta, la sonda se rinde en su timeout y dice que no es Azure', async () => {
    await conServidor(() => { /* never answers */ }, async url => {
        const t0 = Date.now()
        assert.equal(await probeAzureIdentityEndpoint(url, 300), false)
        assert.ok(Date.now() - t0 < 3000, 'se rinde en el timeout, no se cuelga')
    })
})

test('sin nada escuchando (conexion rechazada) no es Azure', async () => {
    assert.equal(await probeAzureIdentityEndpoint('http://127.0.0.1:1/metadata/identity/oauth2/token', 1000), false)
})

// ── where a kubeconfig can come from ───────────────────────────────────────────────────────────────
//
// This exists because of a real failure, seen in a container: loadFromDefault() invents a cluster
// pointing at http://localhost:8080 when it finds no kubeconfig, so asking it afterwards whether there is
// a cluster answers yes, and startup goes chasing a server that does not exist.

const KUBECONFIG_EN_CASA = path.join(os.homedir(), '.kube', 'config')
const TOKEN_IN_CLUSTER = '/var/run/secrets/kubernetes.io/serviceaccount/token'

test('sin ninguna fuente, no hay kubeconfig que valga', async () => {
    await conEntorno({}, () => {
        assert.equal(hasKubeconfigSource(() => false), false)
    })
})

test('el kubeconfig de la cuenta del usuario cuenta como fuente', async () => {
    await conEntorno({}, () => {
        assert.equal(hasKubeconfigSource(ruta => ruta === KUBECONFIG_EN_CASA), true)
    })
})

test('dentro de un pod la fuente es el token que monta el kubelet, no un fichero de kubeconfig', async () => {
    await conEntorno({}, () => {
        assert.equal(hasKubeconfigSource(ruta => ruta === TOKEN_IN_CLUSTER), true)
    })
})

test('KUBECONFIG manda, y vale con que exista una de sus rutas', async () => {
    await conEntorno({ KUBECONFIG: `/a/no/existe${path.delimiter}/b/si/existe` }, () => {
        assert.equal(hasKubeconfigSource(ruta => ruta === '/b/si/existe'), true)
    })
})

test('KUBECONFIG apuntando a algo que no existe no es una fuente, aunque haya uno en la cuenta', async () => {
    // If it has been said explicitly where it is, nowhere else is searched behind its back.
    await conEntorno({ KUBECONFIG: '/no/existe' }, () => {
        assert.equal(hasKubeconfigSource(ruta => ruta === KUBECONFIG_EN_CASA), false)
    })
})

// ── capacidades ────────────────────────────────────────────────────────────────────────────────────

test('dentro de Kubernetes la API no es opcional', async () => {
    const capacidades = await resolveEnvironmentCapabilities(EExecutionEnvironment.KUBERNETES, undefined, probes(false))
    assert.equal(capacidades.kubernetes, true)
    assert.equal(capacidades.store, EStoreKind.KUBERNETES)
})

test('KWIRTH_STORE saca el almacenamiento del cluster y lo lleva a fichero', async () => {
    await conEntorno({ KWIRTH_STORE: '/data/kwirth' }, async () => {
        const capacidades = await resolveEnvironmentCapabilities(EExecutionEnvironment.KUBERNETES, undefined, probes(true))
        assert.equal(capacidades.store, EStoreKind.FILE)
        assert.equal(capacidades.storePath, '/data/kwirth')
    })
})

test("KWIRTH_STORE='etcd' sigue significando el almacenamiento del cluster", async () => {
    await conEntorno({ KWIRTH_STORE: 'etcd' }, async () => {
        const capacidades = await resolveEnvironmentCapabilities(EExecutionEnvironment.KUBERNETES, undefined, probes(true))
        assert.equal(capacidades.store, EStoreKind.KUBERNETES)
    })
})

test('en ECS el almacenamiento es siempre fichero cifrado, haya o no kubeconfig', async () => {
    await conEntorno({}, async () => {
        const conKube = await resolveEnvironmentCapabilities(EExecutionEnvironment.ECS, undefined, probes(true))
        assert.equal(conKube.store, EStoreKind.FILE)
        const sinKube = await resolveEnvironmentCapabilities(EExecutionEnvironment.ECS, undefined, probes(false))
        assert.equal(sinKube.store, EStoreKind.FILE)
    })
})

test('en ECS sin KWIRTH_STORE se avisa de que no hay persistencia', async () => {
    await conEntorno({}, async () => {
        const capacidades = await resolveEnvironmentCapabilities(EExecutionEnvironment.ECS, undefined, probes(false))
        assert.ok(capacidades.reasons.some(r => r.includes('WARNING') && r.includes('KWIRTH_STORE')))
    })
})

test('en Cloud Run y ACI el almacenamiento es fichero cifrado, como en ECS, y sin KWIRTH_STORE se avisa', async () => {
    for (const entorno of [EExecutionEnvironment.CLOUD_RUN, EExecutionEnvironment.ACI]) {
        await conEntorno({}, async () => {
            const sinStore = await resolveEnvironmentCapabilities(entorno, undefined, probes(false))
            assert.equal(sinStore.store, EStoreKind.FILE, `store en '${entorno}'`)
            assert.ok(sinStore.reasons.some(r => r.includes('WARNING') && r.includes('KWIRTH_STORE')), `aviso en '${entorno}'`)
            assert.equal(resolveClusterType(sinStore), EClusterType.NONE)
        })
        await conEntorno({ KWIRTH_STORE: '/mnt/kwirth' }, async () => {
            const conStore = await resolveEnvironmentCapabilities(entorno, undefined, probes(false))
            assert.equal(conStore.storePath, '/mnt/kwirth')
        })
    }
})

test('el modo docker conserva su formato de fichero historico', async () => {
    const capacidades = await resolveEnvironmentCapabilities(EExecutionEnvironment.DOCKER, undefined, probes(false))
    assert.equal(capacidades.store, EStoreKind.FILE_PLAIN)
})

test('fuera de Kubernetes, la API depende de que haya kubeconfig', async () => {
    const conKubeconfig = await resolveEnvironmentCapabilities(EExecutionEnvironment.ECS, undefined, probes(true))
    assert.equal(conKubeconfig.kubernetes, true)
    const sinKubeconfig = await resolveEnvironmentCapabilities(EExecutionEnvironment.ECS, undefined, probes(false))
    assert.equal(sinKubeconfig.kubernetes, false)
})

test('cada capacidad viene con su explicacion, que es lo que se imprime al arrancar', async () => {
    const capacidades = await resolveEnvironmentCapabilities(EExecutionEnvironment.DOCKER, undefined, probes(false))
    assert.ok(capacidades.reasons.some(r => r.startsWith('Kubernetes API:')))
    assert.ok(capacidades.reasons.some(r => r.startsWith('Store:')))
})

// ── where the resources come from ──────────────────────────────────────────────────────────────────

test('con kubeconfig, los recursos salen del cluster, corramos donde corramos', async () => {
    for (const entorno of [EExecutionEnvironment.DOCKER, EExecutionEnvironment.ECS, EExecutionEnvironment.DESKTOP]) {
        const capacidades = await resolveEnvironmentCapabilities(entorno, undefined, probes(true))
        assert.equal(resolveClusterType(capacidades), EClusterType.KUBERNETES, `fallo corriendo en '${entorno}'`)
    }
})

test('sin Kubernetes no se observa infraestructura, y eso tiene nombre propio', async () => {
    // NONE is not a half-finished startup: that Kwirth serves the front end, carries channels that do not
    // look at the cluster, and from it you can federate against another Kwirth or point at a cluster by
    // mounting a kubeconfig.
    const capacidades = await resolveEnvironmentCapabilities(EExecutionEnvironment.ECS, undefined, probes(false))
    assert.equal(resolveClusterType(capacidades), EClusterType.NONE)
})
