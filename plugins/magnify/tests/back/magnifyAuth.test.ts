import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AccessKey, buildThinScope } from '@kwirthmagnify/kwirth-common'
import { allows, canSee, canSeeAnyOf, needsFiltering } from '../../src/common/MagnifyAuth'
import { EMagnifyScope, MAGNIFY_HIDE_KINDS } from '../../src/common/MagnifyScopes'

/*
    Who sees what in Magnify. Until this existed the channel read nothing of its key: `cluster` was the
    only way in and it showed the whole cluster, so there was no way to say 'look but do not touch' or
    'only this namespace'.
*/

const key = (resources: string): AccessKey => ({ id: 'k', type: 'permanent', resources } as AccessKey)
const hiding = (...kinds: string[]) =>
    buildThinScope('magnify', 'read', { [MAGNIFY_HIDE_KINDS]: kinds.join(',') })

test('la escalera concede hacia abajo y corta hacia arriba', () => {
    assert.equal(allows(key(`${EMagnifyScope.USER}::::`), EMagnifyScope.USER), true)
    assert.equal(allows(key(`${EMagnifyScope.USER}::::`), EMagnifyScope.READ), false)
    assert.equal(allows(key(`${EMagnifyScope.WRITE}::::`), EMagnifyScope.READ), true)
    assert.equal(allows(key('cluster::::'), EMagnifyScope.WRITE), true)
    assert.equal(allows(key('admin::::'), EMagnifyScope.WRITE), true)
    assert.equal(allows(undefined, EMagnifyScope.USER), false)
})

test('sin READ no se ve ningun objeto, aunque se pueda abrir el canal', () => {
    const k = key(`${EMagnifyScope.USER}::::`)
    assert.equal(canSee(k, 'Pod', 'pre'), false)
    assert.equal(canSeeAnyOf(k, 'Pod'), false)
})

/*
    🔴 El caso para el que existe todo esto: ver el cluster entero menos los dos kinds que llevan
    credenciales.
*/
test('un scope fino oculta los kinds que dice, y solo esos', () => {
    const k = key(`${hiding('ConfigMap', 'Secret')}::::`)
    assert.equal(canSee(k, 'Secret', 'pre'), false)
    assert.equal(canSee(k, 'ConfigMap', 'pre'), false)
    assert.equal(canSee(k, 'Pod', 'pre'), true)
    assert.equal(canSee(k, 'Deployment', 'pro'), true)
    // y no se le pregunta a Kubernetes por lo que nadie puede ver
    assert.equal(canSeeAnyOf(k, 'Secret'), false)
    assert.equal(canSeeAnyOf(k, 'Pod'), true)
})

/*
    🔴 Decision 3 of the PRD, where it bites: the WIDER form wins. An admin who grants `magnify$read` and
    then adds a narrowed one believing they restricted it has restricted NOTHING. The editor warns about
    it; this proves the channel behaves as the warning says.
*/
test('gana el ancho: la forma ancha al lado anula lo que oculta la fina', () => {
    const k = key(`${EMagnifyScope.READ},${hiding('Secret')}::::`)
    assert.equal(canSee(k, 'Secret', 'pre'), true)
})

test('y cluster o admin tampoco quedan acotados', () => {
    for (const scope of ['cluster', 'admin']) {
        const k = key(`${scope},${hiding('Secret')}::::`)
        assert.equal(canSee(k, 'Secret', 'pre'), true, `'${scope}'`)
    }
})

/*
    Resources are OR'd, so two of them hiding DIFFERENT kinds hide nothing between them: whatever one
    hides, the other grants. Only what BOTH hide stays hidden.
*/
test('varios recursos: se oculta la interseccion, no la union', () => {
    const k = key(`${hiding('Secret')}::::;${hiding('ConfigMap')}::::`)
    assert.equal(canSee(k, 'Secret', 'pre'), true)
    assert.equal(canSee(k, 'ConfigMap', 'pre'), true)

    const ambos = key(`${hiding('Secret', 'ConfigMap')}::::;${hiding('Secret')}::::`)
    assert.equal(canSee(ambos, 'Secret', 'pre'), false)
    assert.equal(canSee(ambos, 'ConfigMap', 'pre'), true)
})

test('los namespaces del recurso acotan donde se ve', () => {
    const k = key(`${EMagnifyScope.READ}:pre:::`)
    assert.equal(canSee(k, 'Pod', 'pre'), true)
    assert.equal(canSee(k, 'Pod', 'pro'), false)
    // son EXPRESIONES REGULARES, como en todo el accessKey
    const re = key(`${EMagnifyScope.READ}:pre-.*:::`)
    assert.equal(canSee(re, 'Pod', 'pre-uno'), true)
    assert.equal(canSee(re, 'Pod', 'preuno'), false)
    // sin namespaces, todo
    assert.equal(canSee(key(`${EMagnifyScope.READ}::::`), 'Pod', 'cualquiera'), true)
})

/*
    🔴 La decision tomada para este canal: una clave acotada a namespaces NO ve lo que no vive en
    ninguno. 'Puedes operar en pre' no incluye los nodos del cluster ni sus ClusterRoles.
*/
test('con namespaces acotados, lo cluster-scoped no se ve', () => {
    const k = key(`${EMagnifyScope.READ}:pre:::`)
    for (const kind of ['Node', 'PersistentVolume', 'ClusterRole', 'StorageClass', 'Namespace']) {
        assert.equal(canSee(k, kind), false, kind)
        assert.equal(canSeeAnyOf(k, kind), false, kind)
    }
    // y sin acotar, se ve
    const libre = key(`${EMagnifyScope.READ}::::`)
    assert.equal(canSee(libre, 'Node'), true)
})

test('cada recurso decide por su cuenta: kinds y namespaces no se mezclan', () => {
    // read en pre sin ocultar nada, y en pro ocultando Secret
    const k = key(`${EMagnifyScope.READ}:pre:::;${hiding('Secret')}:pro:::`)
    assert.equal(canSee(k, 'Secret', 'pre'), true)
    assert.equal(canSee(k, 'Secret', 'pro'), false)
    assert.equal(canSee(k, 'Pod', 'pro'), true)
    assert.equal(canSee(k, 'Pod', 'otro'), false)
})

/*
    Las dos limitaciones EN EL MISMO recurso, que es como se concede de verdad: 'que vea kwirth, pero sin
    ConfigMaps ni Secrets'. Se prueba aparte porque el token fino y el campo de namespaces viven en
    sitios distintos del recurso y nada garantizaba que se leyeran los dos.
*/
test('un scope fino CON namespaces acota las dos cosas a la vez', () => {
    const k = key(`${hiding('ConfigMap', 'Secret')}:kwirth:::`)
    assert.equal(canSee(k, 'Pod', 'kwirth'), true)
    assert.equal(canSee(k, 'Pod', 'kube-system'), false)
    assert.equal(canSee(k, 'ConfigMap', 'kwirth'), false)
    assert.equal(canSee(k, 'Namespace'), false)
    assert.equal(canSee(k, 'Node'), false)
    assert.equal(needsFiltering(k), true)
})

test('needsFiltering: una clave sin limites no hace trabajo', () => {
    assert.equal(needsFiltering(key('cluster::::')), false)
    assert.equal(needsFiltering(key(`${EMagnifyScope.READ}::::`)), false)
    assert.equal(needsFiltering(key(`${EMagnifyScope.READ}:pre:::`)), true)
    assert.equal(needsFiltering(key(`${hiding('Secret')}::::`)), true)
    assert.equal(needsFiltering(undefined), false)
})

// Nothing here may throw: it is called from the websocket handler, and an exception escaping one of
// those from an async path takes the process down.
test('basura: no concede y NO lanza', () => {
    for (const resources of ['', 'basura', '::::::::::', ';;;', 'magnify#read#!!!::::']) {
        assert.doesNotThrow(() => canSee(key(resources), 'Pod', 'pre'), `'${resources}'`)
        assert.equal(canSee(key(resources), 'Pod', 'pre'), false, `'${resources}'`)
    }
    // un patron de namespace que no compila no casa con nada, en vez de reventar
    const malo = key(`${EMagnifyScope.READ}:[:::`)
    assert.doesNotThrow(() => canSee(malo, 'Pod', 'pre'))
    assert.equal(canSee(malo, 'Pod', 'pre'), false)
})
