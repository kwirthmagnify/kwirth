import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchesResource, keyMatchesResource } from '../src/Resources'
import { AccessKey } from '@kwirthmagnify/kwirth-common'

/*
    The half of authorisation that File Manager was missing: not 'may this key do it', but 'may it do it
    HERE'. The verb was gated in fileman 0.2.27 and the target was not, so a key granted on one namespace
    read a file from a pod in another — exploited on dev on 2026-10-17.
*/

const allows = (resources: string, target: { namespace?: string, pod?: string, container?: string }) =>
    matchesResource(resources, target)

test('una clave sin acotar nada alcanza cualquier cosa', () => {
    assert.equal(allows('view::::', { namespace: 'pro', pod: 'p1', container: 'c1' }), true)
})

test('el namespace acota, y lo de fuera se queda fuera', () => {
    assert.equal(allows('view:pre:::', { namespace: 'pre', pod: 'p1' }), true)
    assert.equal(allows('view:pre:::', { namespace: 'pro', pod: 'p1' }), false)
})

/*
    🔴 La propiedad que hizo falta DECIR en vez de cambiar. Las dimensiones son regex SIN ANCLAR, igual
    que `getValidValues` del core: 'kwirth' alcanza 'kwirth-system'. Anclarlas aquí dejaría a los canales
    que usen este helper más estrictos que el core con la misma clave.

    Es exactamente el caso que se explotó: la clave estaba concedida en 'kwirth' y leyó de 'kwirth-system'.
    Con este matcher ya no pasa de largo —hay comprobación—, pero sigue CASANDO, y por eso el editor de
    seguridad dice ahora que son regex y que '^kwirth$' es como se escribe uno exacto.
*/
test('las dimensiones son regex SIN anclar, y el editor lo advierte', () => {
    assert.equal(allows('view:kwirth:::', { namespace: 'kwirth-system' }), true)
    assert.equal(allows('view:^kwirth$:::', { namespace: 'kwirth-system' }), false)
    assert.equal(allows('view:^kwirth$:::', { namespace: 'kwirth' }), true)
    assert.equal(allows('view:pre-.*:::', { namespace: 'pre-uno' }), true)
    assert.equal(allows('view:pre-.*:::', { namespace: 'otro' }), false)
})

test('pods y containers acotan igual, y se combinan con AND dentro del recurso', () => {
    const r = 'view:pre::web-.*:app'
    assert.equal(allows(r, { namespace: 'pre', pod: 'web-1', container: 'app' }), true)
    assert.equal(allows(r, { namespace: 'pre', pod: 'db-1', container: 'app' }), false)
    assert.equal(allows(r, { namespace: 'pre', pod: 'web-1', container: 'sidecar' }), false)
    assert.equal(allows(r, { namespace: 'pro', pod: 'web-1', container: 'app' }), false)
})

test('varios recursos se combinan con OR: basta con que uno cubra', () => {
    const r = 'view:pre:::;view:pro::web-.*:'
    assert.equal(allows(r, { namespace: 'pre', pod: 'cualquiera' }), true)
    assert.equal(allows(r, { namespace: 'pro', pod: 'web-1' }), true)
    assert.equal(allows(r, { namespace: 'pro', pod: 'db-1' }), false)
})

/*
    Una dimensión que la clave acota necesita algo con qué comparar: si el llamante no sabe el pod, no se
    le puede dar por bueno un recurso que restringe pods. Fallar abierto aquí sería conceder por no saber.
*/
test('lo que la clave acota y el llamante no sabe, no se concede', () => {
    assert.equal(allows('view:pre::web-1:', { namespace: 'pre' }), false)
    // y lo que la clave NO acota da igual que no se sepa
    assert.equal(allows('view:pre:::', { namespace: 'pre' }), true)
})

// Se llama desde manejadores de ruta: una excepción aquí se convierte en un unhandledRejection.
test('basura: no concede y NO lanza', () => {
    for (const resources of ['', 'basura', '::::::::::', ';;;', 'view:[:::']) {
        assert.doesNotThrow(() => allows(resources, { namespace: 'pre' }), `'${resources}'`)
    }
    // un patron que no compila no casa con nada, en vez de reventar
    assert.equal(allows('view:[:::', { namespace: 'pre' }), false)
})

test('keyMatchesResource: sin clave no hay permiso', () => {
    assert.equal(keyMatchesResource(undefined, { namespace: 'pre' }), false)
    const key = { id: 'x', type: 'permanent', resources: 'view:pre:::' } as AccessKey
    assert.equal(keyMatchesResource(key, { namespace: 'pre' }), true)
    assert.equal(keyMatchesResource(key, { namespace: 'pro' }), false)
})
