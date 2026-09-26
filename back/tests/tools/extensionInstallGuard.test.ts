import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertInstallable } from '../../src/tools/ExtensionInstallGuard'

/*
    Cuando una extension se puede instalar ENCIMA de otra.

    Instalar y actualizar acaban en el mismo sitio —el install de cada manager ya reemplazaba indice,
    codigo y modulo cargado—, asi que lo unico que separa "actualizar" de "pisar algo por accidente" es
    esta funcion. De ahi que valga la pena fijarla suelta: los managers la llaman los once igual, y un
    despiste aqui sale por once sitios a la vez.

    Lo que se fija: sin permiso explicito no se pisa nada, y con permiso solo se va hacia ADELANTE.
*/

const lanza = (fn: () => void, texto: string) => {
    assert.throws(fn, (err: Error) => {
        assert.match(err.message, new RegExp(texto))
        return true
    })
}

test('lo que no esta instalado se instala, con o sin permiso', () => {
    assertInstallable('Plugin', 'nuevo', undefined, '1.0.0', false)
    assertInstallable('Plugin', 'nuevo', undefined, '1.0.0', true)
    // and it need not know the version either: installing something for the first time compares with nothing
    assertInstallable('Plugin', 'nuevo', undefined, undefined, false)
})

test('sin permiso, lo ya instalado se rechaza — el comportamiento de siempre', () => {
    lanza(() => assertInstallable('Plugin', 'log', { version: '1.0.0' }, '2.0.0', false), "'log' is already installed")
    // permission is explicit: the version being higher is not enough
    lanza(() => assertInstallable('Sender', 'email', { version: '1.0.0' }, '9.9.9', undefined), "'email' is already installed")
})

test('con permiso se actualiza a una version mayor', () => {
    assertInstallable('Plugin', 'log', { version: '1.0.0' }, '1.0.1', true)
    assertInstallable('Plugin', 'log', { version: '0.9.9' }, '1.0.0', true)
    assertInstallable('Plugin', 'log', { version: '1.2.0' }, '1.10.0', true)
})

test('pero NO a la misma ni a una anterior', () => {
    // the same one: pressing twice must not look as if it did something
    lanza(() => assertInstallable('Plugin', 'log', { version: '1.0.0' }, '1.0.0', true), 'is not newer')
    // backwards: it would leave the index saying one thing and the configuration, which is untouched, meant for another
    lanza(() => assertInstallable('Plugin', 'log', { version: '2.0.0' }, '1.9.9', true), 'is not newer')
    lanza(() => assertInstallable('Provider', 'azure', { version: '0.2.0' }, '0.1.0', true), 'is not newer')
})

test('ni a ciegas cuando falta alguna de las dos versiones', () => {
    /*
        Pasa de verdad: lo instalado desde kwirth-dev.json esta cargado sin figurar en el indice, asi que
        los managers le pasan al guardian un objeto sin version. Sin saber de donde se viene no hay forma
        de saber si se avanza, y dar el paso igual seria pisar un dev con lo que haya en el marketplace.
    */
    lanza(() => assertInstallable('Plugin', 'log', {}, '1.0.0', true), 'the installed or the new version is unknown')
    lanza(() => assertInstallable('Plugin', 'log', { version: '1.0.0' }, undefined, true), 'the installed or the new version is unknown')
})

test('el mensaje dice el tipo, la id y las dos versiones', () => {
    // the warning ends up on the dialog's error line, and there a bare 'is not newer' does not say which is which
    lanza(() => assertInstallable('Theme', 'santander', { version: '2.0.0' }, '1.0.0', true),
        "Theme 'santander' v2.0.0 is already installed, and v1.0.0 is not newer")
})
