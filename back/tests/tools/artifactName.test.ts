import { test } from 'node:test'
import assert from 'node:assert/strict'
// The helper lives in the repo's tools/, outside back/. esbuild bundles it like any other import, which
// is what brings it into `npm test` — it used to be a node:test file nobody ran unless by hand.
import { artifactName, tarballName, scopeOf } from '../../../tools/artifact-name.mjs'

/*
    The single place an artifact's name is built: '@<scope>/kwirth-<type>-<id>' and
    '<scope>-kwirth-<type>-<id>-<version>.tgz'.

    What is protected here is not the concatenation, which is trivial, but the two things that went
    wrong: assuming the house, and dropping the 'kwirth-'. The second was actually implemented and had to
    be reverted — the scope says WHOSE a package is, not which product it belongs to, and the marketplace
    is open, so a third party publishes from their own scope alongside other ecosystems' packages.
*/

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
    assert.throws(() => scopeOf(undefined as unknown as string), /must be an npm scope/)
})
