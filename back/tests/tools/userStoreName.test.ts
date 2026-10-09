import test from 'node:test'
import assert from 'node:assert/strict'
import { userStoreName } from '../../src/tools/UserStoreName'

/*
    El nombre del ConfigMap que guarda el store de un usuario.

    🔴 Esto existe por un fallo real (dev, 2026-10-09): el nombre se componía pegando el id del usuario a
    un prefijo, y `jfvilas@gmail.com` produce un nombre que Kubernetes RECHAZA. El store no se podía
    crear, el POST devolvía 500, el front no miraba la respuesta, y el usuario perdía lo que guardaba sin
    un solo aviso. Afecta a cualquier id con forma de email — o sea, a todos en cuanto hay un IdP.
*/

// RFC-1123 subdomain: lo que Kubernetes acepta como nombre de recurso.
const VALID = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/

test('un id que YA daba un nombre válido no se mueve (los stores existentes siguen donde están)', () => {
    assert.equal(userStoreName('admin'), 'kwirth-store-admin')
    assert.equal(userStoreName('jfvilas'), 'kwirth-store-jfvilas')
    assert.equal(userStoreName('user.name-2'), 'kwirth-store-user.name-2')
})

test('🔴 un id con forma de email produce un nombre VÁLIDO', () => {
    const name = userStoreName('jfvilas@gmail.com')
    assert.ok(VALID.test(name), `'${name}' no es un nombre de recurso válido`)
    assert.ok(name.startsWith('kwirth-store-'))
    assert.ok(name.length <= 253)
})

test('🔴 dos ids DISTINTOS nunca comparten store', () => {
    // Sin el digest, estos dos se saneaban al mismo nombre y dos personas acababan compartiendo
    // configuración — que es bastante peor que no poder guardarla.
    assert.notEqual(userStoreName('a@b.com'), userStoreName('a-b.com'))
    assert.notEqual(userStoreName('Pepe@x.com'), userStoreName('pepe@x.com'))
    assert.notEqual(userStoreName('jfvilas@gmail.com'), userStoreName('jfvilas@outlook.com'))
})

test('el mismo id da SIEMPRE el mismo nombre', () => {
    // Si no fuera estable, al reiniciar el back el store del usuario quedaría huérfano.
    assert.equal(userStoreName('jfvilas@gmail.com'), userStoreName('jfvilas@gmail.com'))
})

test('ids hostiles: siempre sale un nombre válido', () => {
    for (const id of ['@', '...', '---', 'ÁÉÍÓÚ', 'a b c', '/etc/passwd', 'x'.repeat(400), 'ñ@ñ.es', '1']) {
        const name = userStoreName(id)
        assert.ok(VALID.test(name), `'${id}' → '${name}' no es válido`)
        assert.ok(name.length <= 253, `'${id}' → nombre demasiado largo (${name.length})`)
    }
})

test('un id larguísimo conserva el digest (es lo que evita la colisión)', () => {
    const a = userStoreName('x'.repeat(400) + 'a@b.com')
    const b = userStoreName('x'.repeat(400) + 'c@b.com')
    assert.ok(a.length <= 253 && b.length <= 253)
    assert.notEqual(a, b, 'al recortar no puede perderse el digest')
})
