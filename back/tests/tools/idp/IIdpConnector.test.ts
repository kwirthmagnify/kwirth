import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EIdpConnectorKind } from '@kwirthmagnify/kwirth-common-back'

// Los valores del enum viajan por wire/config (Secret kwirth-idps), asi que se fijan aqui.
test('EIdpConnectorKind expone los valores de wire esperados', () => {
    assert.equal(EIdpConnectorKind.OIDC, 'oidc')
    assert.equal(EIdpConnectorKind.OAUTH2, 'oauth2')
    assert.deepEqual(Object.values(EIdpConnectorKind).sort(), ['oauth2', 'oidc'])
})
