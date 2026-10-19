import { test } from 'node:test'
import assert from 'node:assert/strict'
import { keyMatchesResource } from '@kwirthmagnify/kwirth-common-back'
import { AccessKey } from '@kwirthmagnify/kwirth-common'

/*
    The half the verb gate of 0.2.27 did not cover: not whether this key may read or write, but whether
    it may do so THERE.

    Every path fileman works with is `/<namespace>/<pod>/<container>/<path inside>`, and it comes from
    the CLIENT — the query string of an endpoint, a command's parameters. Until now nothing contrasted it
    with the key, so a session opened on an allowed pod read `/etc/group` from a pod in `kwirth-system`
    by changing the path in the request. Exploited on dev on 2026-10-17.

    These tests work on the same shape the channel parses, so they fix the behaviour of `mayReach`
    without reaching into the class.
*/

const key = (resources: string): AccessKey => ({ id: 'k', type: 'permanent', resources } as AccessKey)

/** What `mayReach` does with a cluster path, the same two lines. */
const reaches = (resources: string, clusterPath: string): boolean => {
    const [namespace, pod, container] = clusterPath.split('/').slice(1)
    return keyMatchesResource(key(resources), { namespace, pod, container })
}

const GRANTED = 'fileman$read:kwirth:::'

/*
    🔴 THE one. The key of the report, the path of the report, and what it must answer now.
*/
test('el exploit del 2026-10-17: la clave de kwirth no alcanza kwirth-system', () => {
    assert.equal(reaches('fileman$read:^kwirth$:::', '/kwirth-system/kwirth-postgres-0/postgres/etc/group'), false)
    // y sí alcanza lo suyo
    assert.equal(reaches('fileman$read:^kwirth$:::', '/kwirth/kwirth-abc/kwirth/etc/group'), true)
})

/*
    ⚠️ Escrito SIN anclar, el mismo caso pasa — y no es un fallo de este test, es la semántica del core:
    `new RegExp('kwirth').test('kwirth-system')` es true. Se deja fijado aquí porque es lo que un
    administrador tiene que saber, y por eso el editor de seguridad lo dice encima del campo.
*/
test('sin anclar, kwirth SÍ alcanza kwirth-system — y por eso el editor avisa', () => {
    assert.equal(reaches(GRANTED, '/kwirth-system/un-pod/un-contenedor/etc/group'), true)
    assert.equal(reaches(GRANTED, '/produccion/un-pod/un-contenedor/etc/group'), false)
})

test('una clave sin namespaces acotados alcanza cualquier contenedor', () => {
    assert.equal(reaches('fileman$write::::', '/lo-que-sea/un-pod/un-contenedor/tmp/x'), true)
})

test('pod y contenedor acotan igual que el namespace', () => {
    const r = 'fileman$write:pre::web-.*:app'
    assert.equal(reaches(r, '/pre/web-1/app/tmp/x'), true)
    assert.equal(reaches(r, '/pre/db-1/app/tmp/x'), false)
    assert.equal(reaches(r, '/pre/web-1/sidecar/tmp/x'), false)
})

test('varios recursos se combinan con OR', () => {
    const r = 'fileman$read:pre:::;fileman$write:pro::web-.*:'
    assert.equal(reaches(r, '/pre/cualquiera/cualquiera/x'), true)
    assert.equal(reaches(r, '/pro/web-1/c/x'), true)
    assert.equal(reaches(r, '/pro/db-1/c/x'), false)
})

/*
    Una ruta que no trae los tres tramos no puede darse por buena cuando la clave acota: 'no sé qué pod
    es' no es 'cualquier pod'. Conceder por no saber es exactamente como se abren estos agujeros.
*/
test('una ruta incompleta no concede lo que la clave acota', () => {
    // la clave acota pods, y '/pre' no dice cuál: no se da por bueno
    assert.equal(reaches('fileman$read:pre::web-1:', '/pre'), false)
    /*
        Pero '/pre/web-1' SÍ, y conviene no confundirse: esa clave deja los CONTENEDORES sin acotar
        (el quinto campo va vacío), así que no saber el contenedor no quita nada. Solo falla la
        dimensión que la clave restringe de verdad.
    */
    assert.equal(reaches('fileman$read:pre::web-1:', '/pre/web-1'), true)
    assert.equal(reaches('fileman$read:pre::web-1:app', '/pre/web-1'), false)
    // y con la clave sin acotar pods, el namespace basta
    assert.equal(reaches('fileman$read:pre:::', '/pre'), true)
})

// Llega desde un manejador de ruta y desde el websocket: no puede lanzar.
test('basura: no concede y NO lanza', () => {
    for (const path of ['', '/', '///', 'sin-barra-inicial']) {
        assert.doesNotThrow(() => reaches('fileman$read:pre:::', path), `'${path}'`)
        assert.equal(reaches('fileman$read:pre:::', path), false, `'${path}'`)
    }
})
