import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertInstallable } from '../../src/tools/ExtensionInstallGuard'

/*
    When an extension can be installed ON TOP of another one.

    Installing and updating end up in the same place —each manager's install already replaced index, code
    and loaded module— so the only thing separating "updating" from "accidentally overwriting something"
    is this function. Hence it is worth pinning it down on its own: all eleven managers call it the same
    way, and a slip here comes out through eleven places at once.

    What is pinned down: without explicit permission nothing is overwritten, and with permission the only
    way is FORWARD.
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
        It really happens: what is installed from kwirth-dev.json is loaded without appearing in the
        index, so the managers hand the guard an object with no version. Without knowing where we are
        coming from there is no way of knowing whether this moves forward, and taking the step anyway
        would mean overwriting a dev with whatever is in the marketplace.
    */
    lanza(() => assertInstallable('Plugin', 'log', {}, '1.0.0', true), 'the installed or the new version is unknown')
    lanza(() => assertInstallable('Plugin', 'log', { version: '1.0.0' }, undefined, true), 'the installed or the new version is unknown')
})

test('el mensaje dice el tipo, la id y las dos versiones', () => {
    // the warning ends up on the dialog's error line, and there a bare 'is not newer' does not say which is which
    lanza(() => assertInstallable('Theme', 'santander', { version: '2.0.0' }, '1.0.0', true),
        "Theme 'santander' v2.0.0 is already installed, and v1.0.0 is not newer")
})
