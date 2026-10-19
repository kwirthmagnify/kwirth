import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AccessKey, buildThinScope } from '@kwirthmagnify/kwirth-common'
import { allows, canChange, canSee, canSeeAnyOf, needsFiltering } from '../../src/common/MagnifyAuth'
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
    /*
        🔴 Son EXPRESIONES REGULARES y casan SIN ANCLAR, como en todo Kwirth: 'kwirth' alcanza
        'kwirth-system'. No es un descuido de este canal — es lo que hace `getValidValues` del core, y
        Magnify no puede ser más estricto que el resto con la misma clave. Quien lo quiera exacto
        escribe '^kwirth$', y el editor de seguridad lo dice encima del campo.
    */
    assert.equal(canSee(key(`${EMagnifyScope.READ}:kwirth:::`), 'Pod', 'kwirth-system'), true)
    assert.equal(canSee(key(`${EMagnifyScope.READ}:^kwirth$:::`), 'Pod', 'kwirth-system'), false)
    assert.equal(canSee(key(`${EMagnifyScope.READ}:^kwirth$:::`), 'Pod', 'kwirth'), true)

    const re = key(`${EMagnifyScope.READ}:pre-.*:::`)
    assert.equal(canSee(re, 'Pod', 'pre-uno'), true)
    assert.equal(canSee(re, 'Pod', 'otro'), false)
    // sin namespaces, todo
    assert.equal(canSee(key(`${EMagnifyScope.READ}::::`), 'Pod', 'cualquiera'), true)
})

/*
    🔴 La línea entre desarrollador y administrador. `read` y `write` son para lo que trabaja un
    desarrollador —workloads y configuración—; la INFRAESTRUCTURA pide 'cluster', se mire o se toque.

    Sustituye a una regla que se leía bien y se portaba mal: lo cluster-scoped lo veía cualquiera cuya
    clave no acotara namespaces, así que AÑADIR un namespace para acotar le quitaba los ClusterRoles.
    Acotar por un eje no puede mover otro.
*/
const INFRA = ['Node', 'PersistentVolume', 'ClusterRole', 'StorageClass', 'Namespace', 'CustomResourceDefinition']

test('la infraestructura no se ve con read ni con write, acote o no namespaces', () => {
    for (const resources of [`${EMagnifyScope.READ}::::`, `${EMagnifyScope.READ}:pre:::`, `${EMagnifyScope.WRITE}::::`]) {
        for (const kind of INFRA) {
            assert.equal(canSee(key(resources), kind), false, `'${resources}' / ${kind}`)
            assert.equal(canSeeAnyOf(key(resources), kind), false, `'${resources}' / ${kind}`)
        }
    }
})

test('con cluster o admin sí se ve', () => {
    for (const scope of ['cluster', 'admin']) {
        for (const kind of INFRA) assert.equal(canSee(key(`${scope}::::`), kind), true, `'${scope}' / ${kind}`)
    }
})

/*
    🔴 Y no se toca tampoco: un desarrollador que no puede VER un nodo no puede drenarlo. Ver y cambiar
    se deciden con el mismo nivel por kind, para que no puedan separarse por descuido.
*/
test('la infraestructura tampoco se cambia con write', () => {
    for (const kind of INFRA) {
        assert.equal(canChange(key(`${EMagnifyScope.WRITE}::::`), kind), false, kind)
        assert.equal(canChange(key('cluster::::'), kind), true, kind)
    }
})

test('lo que SÍ es del desarrollador: namespaced con write, y solo donde alcanza', () => {
    const k = key(`${EMagnifyScope.WRITE}:pre:::`)
    assert.equal(canChange(k, 'Pod', 'pre'), true)
    assert.equal(canChange(k, 'ConfigMap', 'pre'), true)
    assert.equal(canChange(k, 'Pod', 'pro'), false)
    // leer no basta para cambiar
    assert.equal(canChange(key(`${EMagnifyScope.READ}::::`), 'Pod', 'pre'), false)
})

// No se escribe en lo que no se puede ver: hacerlo sería una forma de averiguar que está ahí.
test('un kind oculto no se cambia', () => {
    const k = key(`${hiding('Secret')}::::;${EMagnifyScope.WRITE}::::`)
    assert.equal(canChange(key(`${hiding('Secret')}::::`), 'Secret', 'pre'), false)
    assert.equal(canSee(k, 'Secret', 'pre'), true)   // el recurso ancho de al lado sí lo concede
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
