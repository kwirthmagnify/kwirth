import { test } from 'node:test'
import assert from 'node:assert/strict'
import { V1Secret } from '@kubernetes/client-node'
import { usersSecretNamespaces, resolveUsersNamespace, USERS_SECRET_NAMES } from '../../src/tools/UsersSecret'

/*
    Which namespace Kwirth adopts as its own when it runs OUTSIDE the cluster.

    Inside the cluster the question does not exist: the pod knows its namespace. Outside, there is no
    namespace of its own, so the users Secret names it — and from that namespace come the Secrets and the
    ConfigMaps of the WHOLE core, not just the users.

    🔴 What is pinned down here is that the answer is a list, because that is what lets the caller refuse
    to start. Picking 'the first one found' with two Kwirths installed takes over the other one's store,
    and the symptom appears somewhere else entirely: the OTHER Kwirth stops recognising its own admin.
*/

const secret = (name: string, namespace?: string): V1Secret => ({ metadata: { name, namespace } })

test('un solo users secret: su namespace, sin preguntas', () => {
    const found = usersSecretNamespaces([
        secret('other-thing', 'default'),
        secret('kwirth-users', 'kwirth'),
        secret('kwirth-signups', 'kwirth')
    ])
    assert.deepEqual(found, ['kwirth'])
})

test('ninguno: lista vacia, que es lo que distingue "no hay" de "hay varios"', () => {
    assert.deepEqual(usersSecretNamespaces([secret('kwirth-signups', 'kwirth')]), [])
    assert.deepEqual(usersSecretNamespaces([]), [])
})

test('🔴 DOS instalaciones: los devuelve AMBOS, para que quien llama pueda negarse a arrancar', () => {
    const found = usersSecretNamespaces([
        secret('kwirth-users', 'kwirth'),
        secret('kwirth-users', 'otro-kwirth')
    ])
    assert.equal(found.length, 2)
    assert.deepEqual([...found].sort(), ['kwirth', 'otro-kwirth'])
})

test('la grafia con guion gana a la del punto, y no se mezclan', () => {
    // Con las dos presentes manda 'kwirth-users', como hacia el codigo original.
    const found = usersSecretNamespaces([
        secret('kwirth.users', 'viejo'),
        secret('kwirth-users', 'nuevo')
    ])
    assert.deepEqual(found, ['nuevo'])
})

test('la grafia con punto se usa SOLO si no hay ninguna con guion', () => {
    assert.deepEqual(usersSecretNamespaces([secret('kwirth.users', 'viejo')]), ['viejo'])
})

test('🔴 dos con la grafia del punto tambien son dos instalaciones', () => {
    // No es un caso teorico: quien siga con la grafia vieja merece el mismo corte que los demas.
    const found = usersSecretNamespaces([
        secret('kwirth.users', 'uno'),
        secret('kwirth.users', 'dos')
    ])
    assert.equal(found.length, 2)
})

test('un secret sin namespace no se descarta en silencio: cuenta, y se nombra', () => {
    /*
        Si viniera sin namespace y se filtrara, dos instalaciones podrian parecer una y volveria
        exactamente el fallo que esto existe para cortar. Cuenta, y sale con una marca legible.
    */
    const found = usersSecretNamespaces([
        secret('kwirth-users', 'kwirth'),
        secret('kwirth-users', undefined)
    ])
    assert.equal(found.length, 2)
    assert.ok(found.includes('(unknown)'))
})

test('los nombres que se buscan estan en orden de preferencia', () => {
    assert.deepEqual(USERS_SECRET_NAMES, ['kwirth-users', 'kwirth.users'])
})

/*
    KWIRTH_NAMESPACE: el escape para cuando hay dos Kwirth desplegados en el mismo cluster y se esta
    desarrollando contra uno de ellos. Solo cuenta corriendo FUERA del cluster con kube forzado; dentro,
    el pod sabe su namespace y esto ni se lee.
*/

test('🔴 KWIRTH_NAMESPACE manda, y DESEMPATA lo que si no cortaria el arranque', () => {
    // Las dos instalaciones siguen ahi: lo que cambia es que ya no hay nada que adivinar.
    const dos = [secret('kwirth-users', 'kwirth'), secret('kwirth-users', 'otro-kwirth')]
    assert.equal(usersSecretNamespaces(dos).length, 2, 'sin la variable, sigue siendo ambiguo')
    assert.deepEqual(resolveUsersNamespace('otro-kwirth', dos), ['otro-kwirth'])
})

test('🔴 NO se valida contra el cluster: vale un namespace sin users secret', () => {
    /*
        Es deliberado y es el motivo de que exista: la variable esta para cuando la busqueda no puede
        decidir, asi que hacerla depender de esa misma busqueda la dejaria inservible. Y un namespace
        limpio es un primer arranque de los de toda la vida.
    */
    assert.deepEqual(resolveUsersNamespace('recien-creado', []), ['recien-creado'])
    assert.deepEqual(resolveUsersNamespace('recien-creado', [secret('kwirth-users', 'otro')]), ['recien-creado'])
})

test('sin la variable, se decide como siempre', () => {
    const uno = [secret('kwirth-users', 'kwirth')]
    assert.deepEqual(resolveUsersNamespace(undefined, uno), ['kwirth'])
    assert.deepEqual(resolveUsersNamespace('', uno), ['kwirth'])
    assert.deepEqual(resolveUsersNamespace(undefined, []), [])
})

test('una variable con espacios no cuenta como nombre', () => {
    // '   ' es lo que deja un KWIRTH_NAMESPACE puesto a medias; tomarlo como namespace daria un fallo
    // mucho mas adelante y en otro sitio, asi que se trata como no puesta.
    assert.deepEqual(resolveUsersNamespace('   ', [secret('kwirth-users', 'kwirth')]), ['kwirth'])
})

test('se recorta el valor: un espacio de mas al pegarlo no cambia el namespace', () => {
    assert.deepEqual(resolveUsersNamespace(' otro-kwirth ', []), ['otro-kwirth'])
})
