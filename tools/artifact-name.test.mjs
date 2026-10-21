/*  node --test tools/artifact-name.test.mjs
 *
 *  Lo que se protege aquí no es la concatenación, que es trivial, sino las dos cosas que el formato
 *  anterior hizo mal: colar el `kwirth-` del medio, y dar por supuesta la casa.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { artifactName, tarballName, scopeOf } from './artifact-name.mjs'

test('el nombre npm es @<scope>/<type>-<id>, sin el kwirth- del medio', () => {
    assert.equal(artifactName('@iriaoperae', 'plugin', 'excubitor'), '@iriaoperae/plugin-excubitor')
    assert.equal(artifactName('@kwirthmagnify', 'provider', 'trivy'), '@kwirthmagnify/provider-trivy')
    assert.equal(artifactName('@jfvilas', 'login', 'asteroids'), '@jfvilas/login-asteroids')
})

test('el tarball es <scope>-<type>-<id>-<version>.tgz, como lo haria npm pack', () => {
    assert.equal(tarballName('@iriaoperae', 'plugin', 'excubitor', '0.2.63'), 'iriaoperae-plugin-excubitor-0.2.63.tgz')
    assert.equal(tarballName('@kwirthmagnify', 'docs', 'cloud-config', '0.3.3'), 'kwirthmagnify-docs-cloud-config-0.3.3.tgz')
})

test('las tres casas salen distintas: ninguna de pago hereda prefijo publico', () => {
    const houses = ['@kwirthmagnify', '@jfvilas', '@iriaoperae']
    const names = houses.map(h => artifactName(h, 'login', 'montag'))
    assert.equal(new Set(names).size, 3)
    assert.ok(names.includes('@iriaoperae/login-montag'))
})

test('un id con guiones se respeta entero', () => {
    assert.equal(artifactName('@iriaoperae', 'dce', 'aws-auth'), '@iriaoperae/dce-aws-auth')
    assert.equal(tarballName('@iriaoperae', 'dce', 'aws-auth', '0.1.0'), 'iriaoperae-dce-aws-auth-0.1.0.tgz')
})

test('un publisher que no es un scope npm falla en vez de componer una cosa rara', () => {
    // Es el valor que tenian santander y los themes: el nombre comercial, no el scope.
    assert.throws(() => artifactName('IRIA Operae', 'theme', 'santander'), /must be an npm scope/)
    assert.throws(() => scopeOf('kwirthmagnify'), /must be an npm scope/)
    assert.throws(() => scopeOf(undefined), /must be an npm scope/)
})
