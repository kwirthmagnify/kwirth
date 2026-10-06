import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EExecutionEnvironment, EInstallationIdSource } from '@kwirthmagnify/kwirth-common'
import { IIdentityProbes, resolveInstallationIdentity } from '../../src/tools/InstallationIdentity'

/*
    The installation identity without Kubernetes, with each platform played by injected probes: the ECS
    task metadata, the GCP metadata server and an Azure managed identity token. Nothing touches the network.
*/

const ECS_BASE = 'http://169.254.170.2/v4/abc'

// A fake world: answers by URL, a store in memory, and the log captured.
const world = (opts: { env?: NodeJS.ProcessEnv, json?: Record<string, unknown>, text?: Record<string, string>, stored?: string }): { probes: IIdentityProbes, logs: string[], store: { value?: string } } => {
    const logs: string[] = []
    const store = { value: opts.stored }
    const probes: IIdentityProbes = {
        env: opts.env ?? {},
        getJson: async url => opts.json?.[url.split('?')[0]],
        getText: async url => opts.text?.[url],
        readStored: async () => store.value,
        writeStored: async id => { store.value = id },
        log: m => { logs.push(m) }
    }
    return { probes, logs, store }
}

// A JWT whose payload carries the given claims (unsigned: the code only reads it, never trusts it).
const jwt = (claims: object): string =>
    `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`

const AZURE_TOKEN = 'http://169.254.169.254/metadata/identity/oauth2/token'
const GCP = 'http://metadata.google.internal/computeMetadata/v1'

// ── ECS ──────────────────────────────────────────────────────────────────────────────────────────────

test('ECS: cuenta, region y cluster del ARN del cluster + family de la tarea', async () => {
    const { probes } = world({
        env: { ECS_CONTAINER_METADATA_URI_V4: ECS_BASE },
        json: { [`${ECS_BASE}/task`]: { Cluster: 'arn:aws:ecs:eu-west-1:123456789012:cluster/prod', TaskARN: 'arn:aws:ecs:eu-west-1:123456789012:task/prod/0f1e', Family: 'kwirth' } }
    })
    const id = await resolveInstallationIdentity(EExecutionEnvironment.ECS, true, probes)
    assert.deepEqual(id, { id: 'aws:ecs:123456789012:eu-west-1:prod:kwirth', name: 'ecs/prod/kwirth', source: EInstallationIdSource.ECS })
})

test('ECS: con el cluster como nombre a secas (agente antiguo), cuenta y region salen del ARN de la tarea', async () => {
    const { probes } = world({
        env: { ECS_CONTAINER_METADATA_URI_V4: ECS_BASE },
        json: { [`${ECS_BASE}/task`]: { Cluster: 'prod', TaskARN: 'arn:aws:ecs:us-east-1:111122223333:task/prod/9abc', Family: 'kwirth' } }
    })
    const id = await resolveInstallationIdentity(EExecutionEnvironment.ECS, true, probes)
    assert.equal(id.id, 'aws:ecs:111122223333:us-east-1:prod:kwirth')
})

test('ECS: el id NO cambia al reciclar la tarea (otro TaskARN, misma family y cluster)', async () => {
    const run = async (taskId: string): Promise<string> => {
        const { probes } = world({
            env: { ECS_CONTAINER_METADATA_URI_V4: ECS_BASE },
            json: { [`${ECS_BASE}/task`]: { Cluster: 'arn:aws:ecs:eu-west-1:1:cluster/prod', TaskARN: `arn:aws:ecs:eu-west-1:1:task/prod/${taskId}`, Family: 'kwirth' } }
        })
        return (await resolveInstallationIdentity(EExecutionEnvironment.ECS, true, probes)).id
    }
    assert.equal(await run('aaaa'), await run('bbbb'))
})

test('ECS: dos Kwirth en la MISMA cuenta y region no colisionan (distinta family)', async () => {
    const run = async (family: string): Promise<string> => {
        const { probes } = world({
            env: { ECS_CONTAINER_METADATA_URI_V4: ECS_BASE },
            json: { [`${ECS_BASE}/task`]: { Cluster: 'arn:aws:ecs:eu-west-1:1:cluster/prod', Family: family } }
        })
        return (await resolveInstallationIdentity(EExecutionEnvironment.ECS, true, probes)).id
    }
    assert.notEqual(await run('kwirth-a'), await run('kwirth-b'))
})

test('ECS: si el endpoint de metadatos no contesta, cae a un id generado y dice por que', async () => {
    const { probes, logs } = world({ env: { ECS_CONTAINER_METADATA_URI_V4: ECS_BASE } })
    const id = await resolveInstallationIdentity(EExecutionEnvironment.ECS, true, probes)
    assert.equal(id.source, EInstallationIdSource.GENERATED)
    assert.match(id.id, /^uuid:[0-9a-f-]{36}$/)
    assert.ok(logs.some(l => l.includes('ecs platform gave none') && l.includes('did not answer')))
})

// ── Cloud Run ────────────────────────────────────────────────────────────────────────────────────────

test('Cloud Run: proyecto y region del metadata server + servicio de K_SERVICE', async () => {
    const { probes } = world({
        env: { K_SERVICE: 'kwirth' },
        text: { [`${GCP}/project/project-id`]: 'my-project\n', [`${GCP}/instance/region`]: 'projects/123456/regions/europe-west1' }
    })
    const id = await resolveInstallationIdentity(EExecutionEnvironment.CLOUD_RUN, true, probes)
    assert.deepEqual(id, { id: 'gcp:run:my-project:europe-west1:kwirth', name: 'run/kwirth', source: EInstallationIdSource.CLOUD_RUN })
})

test('Cloud Run: sin metadata server, cae a un id generado', async () => {
    const { probes, logs } = world({ env: { K_SERVICE: 'kwirth' } })
    const id = await resolveInstallationIdentity(EExecutionEnvironment.CLOUD_RUN, true, probes)
    assert.equal(id.source, EInstallationIdSource.GENERATED)
    assert.ok(logs.some(l => l.includes('cloudrun platform gave none')))
})

// ── ACI ──────────────────────────────────────────────────────────────────────────────────────────────

const RID = '/subscriptions/0000-SUB/resourceGroups/RG-Kwirth/providers/Microsoft.ContainerInstance/containerGroups/Kwirth-Group'

test('ACI con identidad SYSTEM-assigned: el recurso sale de xms_mirid, en minusculas', async () => {
    const { probes } = world({ json: { [AZURE_TOKEN]: { access_token: jwt({ xms_mirid: RID }) } } })
    const id = await resolveInstallationIdentity(EExecutionEnvironment.ACI, true, probes)
    assert.deepEqual(id, { id: 'azure:aci:0000-sub:rg-kwirth:kwirth-group', name: 'aci/kwirth-group', source: EInstallationIdSource.AZURE_MANAGED_IDENTITY })
})

test('ACI con identidad USER-assigned: manda xms_az_rid (el container group), no xms_mirid (la identidad, compartible)', async () => {
    const identityRid = '/subscriptions/0000-sub/resourcegroups/rg-ids/providers/Microsoft.ManagedIdentity/userAssignedIdentities/shared-id'
    const { probes } = world({ json: { [AZURE_TOKEN]: { access_token: jwt({ xms_mirid: identityRid, xms_az_rid: RID }) } } })
    const id = await resolveInstallationIdentity(EExecutionEnvironment.ACI, true, probes)
    assert.equal(id.id, 'azure:aci:0000-sub:rg-kwirth:kwirth-group')
})

test('ACI sin identidad gestionada: cae a un id generado y explica que no hay identidad', async () => {
    const { probes, logs } = world({})
    const id = await resolveInstallationIdentity(EExecutionEnvironment.ACI, true, probes)
    assert.equal(id.source, EInstallationIdSource.GENERATED)
    assert.ok(logs.some(l => l.includes('no managed identity')))
})

test('ACI: un token sin un id de recurso utilizable cae a generado', async () => {
    const { probes } = world({ json: { [AZURE_TOKEN]: { access_token: jwt({ oid: 'x' }) } } })
    assert.equal((await resolveInstallationIdentity(EExecutionEnvironment.ACI, true, probes)).source, EInstallationIdSource.GENERATED)
})

// ── generated ────────────────────────────────────────────────────────────────────────────────────────

test('generado: la primera vez crea uuid:<uuid> y lo guarda; la segunda REUTILIZA el guardado', async () => {
    const w = world({})
    const first = await resolveInstallationIdentity(EExecutionEnvironment.DOCKER, true, w.probes)
    assert.match(first.id, /^uuid:[0-9a-f-]{36}$/)
    assert.equal(w.store.value, first.id, 'guardado en el almacen')
    assert.equal(first.name, `kwirth-${first.id.slice(5, 13)}`)
    const second = await resolveInstallationIdentity(EExecutionEnvironment.DOCKER, true, w.probes)
    assert.equal(second.id, first.id, 'estable entre arranques')
})

test('generado: dos instalaciones distintas tienen ids distintos', async () => {
    const a = await resolveInstallationIdentity(EExecutionEnvironment.DOCKER, true, world({}).probes)
    const b = await resolveInstallationIdentity(EExecutionEnvironment.DOCKER, true, world({}).probes)
    assert.notEqual(a.id, b.id)
})

test('generado: en un almacen NO persistente se avisa de que se perdera; en uno persistente no', async () => {
    const volatile = world({})
    await resolveInstallationIdentity(EExecutionEnvironment.ECS, false, volatile.probes)
    assert.ok(volatile.logs.some(l => l.startsWith('WARNING') && l.includes('orphaned')))
    const durable = world({})
    await resolveInstallationIdentity(EExecutionEnvironment.DOCKER, true, durable.probes)
    assert.ok(!durable.logs.some(l => l.startsWith('WARNING')))
})

test('generado: un valor guardado que no es uuid: se ignora y se regenera', async () => {
    const w = world({ stored: 'garbage' })
    const id = await resolveInstallationIdentity(EExecutionEnvironment.DESKTOP, true, w.probes)
    assert.match(id.id, /^uuid:/)
})

test('docker y desktop sin Kubernetes van directos al generado (no hay fuente de plataforma)', async () => {
    for (const env of [EExecutionEnvironment.DOCKER, EExecutionEnvironment.DESKTOP]) {
        const { probes, logs } = world({})
        const id = await resolveInstallationIdentity(env, true, probes)
        assert.equal(id.source, EInstallationIdSource.GENERATED, env)
        assert.ok(!logs.some(l => l.includes('platform gave none')), `${env}: sin intento de plataforma`)
    }
})
