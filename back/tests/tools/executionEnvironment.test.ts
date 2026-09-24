import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EClusterType, EExecutionEnvironment } from '@kwirthmagnify/kwirth-common'
import { EStoreKind, IEnvironmentProbes, detectExecutionEnvironment, resolveEnvironmentCapabilities, resolveClusterType, hasKubeconfigSource } from '../../src/tools/ExecutionEnvironment'
import os from 'os'
import path from 'path'

/*
    Las variables que deciden el entorno. Se limpian antes de cada caso porque el proceso de test las
    hereda del shell, y un KWIRTH_STORE puesto en la maquina de quien corre esto cambiaria el resultado.
*/
const VARIABLES = ['FORCE', 'KUBERNETES_SERVICE_HOST', 'ECS_CONTAINER_METADATA_URI_V4', 'ECS_CONTAINER_METADATA_URI', 'KWIRTH_STORE', 'KWIRTH_CLUSTER_NAME']

/*
    Siempre async y con await al caso. Si el finally corriese al DEVOLVER la promesa en vez de al
    resolverla, las variables se restaurarian antes de que el caso las hubiese leido: resolveStore consulta
    KWIRTH_STORE despues del primer await interno, asi que el test pasaria o fallaria segun el entorno de
    quien lo corre, que es la peor clase de test.
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

// ── deteccion del entorno ──────────────────────────────────────────────────────────────────────────

test('FORCE manda sobre cualquier otra senal', async () => {
    await conEntorno({ FORCE: 'ecs', KUBERNETES_SERVICE_HOST: '10.0.0.1' }, () => {
        assert.equal(detectExecutionEnvironment(), EExecutionEnvironment.ECS)
    })
    await conEntorno({ FORCE: 'k8s' }, () => {
        assert.equal(detectExecutionEnvironment(), EExecutionEnvironment.KUBERNETES)
    })
    await conEntorno({ FORCE: 'docker' }, () => {
        assert.equal(detectExecutionEnvironment(), EExecutionEnvironment.DOCKER)
    })
    await conEntorno({ FORCE: 'desktop' }, () => {
        assert.equal(detectExecutionEnvironment(), EExecutionEnvironment.DESKTOP)
    })
})

test('dentro de un pod, el entorno es Kubernetes', async () => {
    await conEntorno({ KUBERNETES_SERVICE_HOST: '10.0.0.1' }, () => {
        assert.equal(detectExecutionEnvironment(), EExecutionEnvironment.KUBERNETES)
    })
})

test('el metadata del agente de ECS identifica el entorno, en los dos launch types', async () => {
    await conEntorno({ ECS_CONTAINER_METADATA_URI_V4: 'http://169.254.170.2/v4/abc' }, () => {
        assert.equal(detectExecutionEnvironment(), EExecutionEnvironment.ECS)
    })
    // la variable sin '_V4' es la del agente antiguo, y tambien vale
    await conEntorno({ ECS_CONTAINER_METADATA_URI: 'http://169.254.170.2/v3/abc' }, () => {
        assert.equal(detectExecutionEnvironment(), EExecutionEnvironment.ECS)
    })
})

test('sin ninguna senal, el entorno no se detecta', async () => {
    await conEntorno({}, () => {
        assert.equal(detectExecutionEnvironment(), undefined)
    })
})

// ── de donde puede salir un kubeconfig ─────────────────────────────────────────────────────────────
//
// Esto existe por un fallo real, visto en un contenedor: loadFromDefault() se inventa un cluster
// apuntando a http://localhost:8080 cuando no encuentra ningun kubeconfig, asi que preguntarle despues
// si hay cluster responde que si, y el arranque se va detras de un servidor inexistente.

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
    // Si se ha dicho explicitamente donde esta, no se busca en otro sitio a sus espaldas.
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

// ── de donde salen los recursos ────────────────────────────────────────────────────────────────────

test('con kubeconfig, los recursos salen del cluster, corramos donde corramos', async () => {
    for (const entorno of [EExecutionEnvironment.DOCKER, EExecutionEnvironment.ECS, EExecutionEnvironment.DESKTOP]) {
        const capacidades = await resolveEnvironmentCapabilities(entorno, undefined, probes(true))
        assert.equal(resolveClusterType(capacidades), EClusterType.KUBERNETES, `fallo corriendo en '${entorno}'`)
    }
})

test('sin Kubernetes no se observa infraestructura, y eso tiene nombre propio', async () => {
    // NONE no es un arranque a medias: ese Kwirth sirve el front, lleva canales que no miran al cluster,
    // y desde el se puede federar contra otro Kwirth o apuntar a un cluster montando un kubeconfig.
    const capacidades = await resolveEnvironmentCapabilities(EExecutionEnvironment.ECS, undefined, probes(false))
    assert.equal(resolveClusterType(capacidades), EClusterType.NONE)
})
