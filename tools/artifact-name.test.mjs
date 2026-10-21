/*  node --test tools/artifact-name.test.mjs
 *
 *  Lo que se protege aquí no es la concatenación, que es trivial, sino dar por supuesta la casa — y que
 *  el `kwirth-` SIGA AHÍ: se quitó por redundante y hubo que devolverlo, porque el scope dice de quién es
 *  el paquete, no de qué producto, y `@scope/plugin-<id>` es la convención de Backstage.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { artifactName, tarballName, scopeOf } from './artifact-name.mjs'

test('el nombre npm es @<scope>/kwirth-<type>-<id>, con el producto por delante del tipo', () => {
    assert.equal(artifactName('@iriaoperae', 'plugin', 'excubitor'), '@iriaoperae/kwirth-plugin-excubitor')
    assert.equal(artifactName('@kwirthmagnify', 'provider', 'trivy'), '@kwirthmagnify/kwirth-provider-trivy')
    assert.equal(artifactName('@jfvilas', 'login', 'asteroids'), '@jfvilas/kwirth-login-asteroids')
})

test('🔴 el kwirth- va TAMBIEN en un scope de terceros: ahi es donde hace falta', () => {
    // @jfvilas publica para Grafana, Backstage y Kwirth desde el mismo scope. Sin el 'kwirth-' esto seria
    // '@jfvilas/plugin-asteroids', que por convencion parece un plugin de Backstage.
    assert.equal(artifactName('@jfvilas', 'plugin', 'asteroids'), '@jfvilas/kwirth-plugin-asteroids')
    assert.ok(!artifactName('@jfvilas', 'plugin', 'asteroids').includes('/plugin-'))
})

test('el tarball es <scope>-kwirth-<type>-<id>-<version>.tgz, como lo haria npm pack', () => {
    assert.equal(tarballName('@iriaoperae', 'plugin', 'excubitor', '0.2.63'), 'iriaoperae-kwirth-plugin-excubitor-0.2.63.tgz')
    assert.equal(tarballName('@kwirthmagnify', 'docs', 'cloud-config', '0.3.3'), 'kwirthmagnify-kwirth-docs-cloud-config-0.3.3.tgz')
})

test('las tres casas salen distintas: ninguna de pago hereda prefijo publico', () => {
    const houses = ['@kwirthmagnify', '@jfvilas', '@iriaoperae']
    const names = houses.map(h => artifactName(h, 'login', 'montag'))
    assert.equal(new Set(names).size, 3)
    assert.ok(names.includes('@iriaoperae/kwirth-login-montag'))
})

test('un id con guiones se respeta entero', () => {
    assert.equal(artifactName('@iriaoperae', 'dce', 'aws-auth'), '@iriaoperae/kwirth-dce-aws-auth')
    assert.equal(tarballName('@iriaoperae', 'dce', 'aws-auth', '0.1.0'), 'iriaoperae-kwirth-dce-aws-auth-0.1.0.tgz')
})

test('un publisher que no es un scope npm falla en vez de componer una cosa rara', () => {
    // Es el valor que tenian santander y los themes: el nombre comercial, no el scope.
    assert.throws(() => artifactName('IRIA Operae', 'theme', 'santander'), /must be an npm scope/)
    assert.throws(() => scopeOf('kwirthmagnify'), /must be an npm scope/)
    assert.throws(() => scopeOf(undefined), /must be an npm scope/)
})
