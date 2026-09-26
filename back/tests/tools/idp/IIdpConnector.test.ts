import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EIdpConnectorKind } from '@kwirthmagnify/kwirth-common-back'

// The enum's values travel over the wire and through config (the kwirth-idps Secret), so they are pinned here.
test('EIdpConnectorKind expone los valores de wire esperados', () => {
    assert.equal(EIdpConnectorKind.OIDC, 'oidc')
    assert.equal(EIdpConnectorKind.OAUTH2, 'oauth2')
    assert.deepEqual(Object.values(EIdpConnectorKind).sort(), ['oauth2', 'oidc'])
})
