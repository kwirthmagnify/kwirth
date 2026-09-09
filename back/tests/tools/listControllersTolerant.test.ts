import { test } from 'node:test'
import assert from 'node:assert/strict'
import { listControllersTolerant } from '../../src/tools/AuthorizationManagement'

// Un ServiceAccount real no siempre puede listar los seis tipos de controller. El ClusterRole de la
// documentacion de instalacion no incluia el apiGroup 'batch', asi que 'jobs' respondia 403 — y con un
// Promise.all eso rechazaba la promesa entera: el selector se quedaba SIN NINGUN controller, ni siquiera
// los deployments, que si se podian leer. Y como el catch devolvia [], era indistinguible de 'este
// namespace no tiene nada'.
//
// Estos tests fijan lo contrario: lo que se puede leer, se lee; lo que no, se reporta nombrando el tipo y
// su apiGroup, que es el dato que permite arreglar el RBAC.

const ok = (kind: string, apiGroup: string, names: [string, string][]) => ({
    kind, apiGroup,
    list: async () => ({ items: names.map(([namespace, name]) => ({ metadata: { namespace, name } })) })
})

const forbidden = (kind: string, apiGroup: string) => ({
    kind, apiGroup,
    list: async () => { throw Object.assign(new Error('Forbidden'), { code: 403 }) }
})

test('un 403 en UN tipo no se lleva por delante a los demas', async () => {
    const failures: string[] = []
    const found = await listControllersTolerant(
        [
            ok('Deployment', 'apps', [['produccion', 'api'], ['produccion', 'web']]),
            forbidden('Job', 'batch'),
            ok('StatefulSet', 'apps', [['produccion', 'postgres']])
        ],
        kind => { failures.push(kind) }
    )
    assert.deepEqual(found.map(c => `${c.kind}/${c.name}`), ['Deployment/api', 'Deployment/web', 'StatefulSet/postgres'])
    assert.deepEqual(failures, ['Job'], 'solo debe reportarse el que fallo')
})

test('el fallo dice el TIPO y su APIGROUP, que es lo que hace falta para arreglar el RBAC', async () => {
    const reported: { kind: string, apiGroup: string }[] = []
    await listControllersTolerant([forbidden('Job', 'batch')], (kind, apiGroup) => reported.push({ kind, apiGroup }))
    assert.deepEqual(reported, [{ kind: 'Job', apiGroup: 'batch' }])
})

test('si fallan TODOS se devuelve vacio, pero cada uno queda reportado', async () => {
    const reported: string[] = []
    const found = await listControllersTolerant(
        [forbidden('Deployment', 'apps'), forbidden('Job', 'batch')],
        (kind, apiGroup) => reported.push(`${kind}@${apiGroup}`)
    )
    assert.deepEqual(found, [])
    assert.deepEqual(reported, ['Deployment@apps', 'Job@batch'], 'vacio SIN motivo es lo que costo el diagnostico')
})

test('cada controller conserva su namespace: el llamante filtra por el', async () => {
    const found = await listControllersTolerant([
        ok('Deployment', 'apps', [['produccion', 'api'], ['staging', 'api']])
    ], () => {})
    assert.deepEqual(found, [
        { kind: 'Deployment', name: 'api', namespace: 'produccion' },
        { kind: 'Deployment', name: 'api', namespace: 'staging' }
    ])
})

test('un objeto sin nombre o sin namespace se descarta en vez de colarse a medias', async () => {
    const rare = {
        kind: 'Deployment', apiGroup: 'apps',
        list: async () => ({ items: [{ metadata: { namespace: 'x' } }, { metadata: { name: 'y' } }, {}] })
    }
    assert.deepEqual(await listControllersTolerant([rare], () => {}), [])
})

test('sin fuentes no se llama a nadie ni se reporta nada', async () => {
    let called = 0
    assert.deepEqual(await listControllersTolerant([], () => { called++ }), [])
    assert.equal(called, 0)
})
