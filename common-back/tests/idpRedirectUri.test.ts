import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IDP_REDIRECT_URI_FIELD, idpRedirectUriField, resolveIdpRedirectUri } from '../src/IIdpConnector'
import { oidcConfigSchema } from '../src/oidc'
import { oauth2ConfigSchema } from '../src/oauth2'

/*
    The redirect_uri an IdP instance uses. The core derives one from the request and hands it over as a
    default; the instance can pin its own, like it pins 'issuer' or 'scopes'.

    Why it has to be pinnable: inside the pod the connection is plain HTTP, so a proxy that does not
    forward 'X-Forwarded-Proto' makes the derived value come out as 'http://…' for a site the browser
    reached over HTTPS — and OAuth2 only accepts 'http' on loopback, so the provider rejects it.
*/

const DERIVED = 'http://kwirth.internal:3883/core/auth/gitlab-onprem/callback'
const PINNED = 'https://kwirth.example.com/kwirth-iria-demo/core/auth/gitlab-onprem/callback'

test('un redirectUri fijado gana sobre el derivado', () => {
    assert.equal(resolveIdpRedirectUri({ redirectUri: PINNED }, DERIVED), PINNED)
})

test('sin redirectUri, o vacio, se usa el derivado', () => {
    assert.equal(resolveIdpRedirectUri({}, DERIVED), DERIVED)
    assert.equal(resolveIdpRedirectUri({ redirectUri: '' }, DERIVED), DERIVED)
    assert.equal(resolveIdpRedirectUri({ redirectUri: '   ' }, DERIVED), DERIVED)
})

test('un valor que no es una URL http/https utilizable se ignora', () => {
    for (const malo of ['no-es-una-url', 'ftp://kwirth.example.com/cb', '/core/auth/x/callback', 'javascript:alert(1)']) {
        assert.equal(resolveIdpRedirectUri({ redirectUri: malo }, DERIVED), DERIVED, `con '${malo}'`)
    }
})

// It has to match what is registered at the provider BYTE FOR BYTE, and a value pasted into a form
// arrives with whitespace around it more often than not.
test('se recortan los espacios alrededor', () => {
    assert.equal(resolveIdpRedirectUri({ redirectUri: `  ${PINNED}  ` }, DERIVED), PINNED)
})

test('un valor que no es texto se ignora', () => {
    assert.equal(resolveIdpRedirectUri({ redirectUri: 42 }, DERIVED), DERIVED)
    assert.equal(resolveIdpRedirectUri({ redirectUri: null }, DERIVED), DERIVED)
    assert.equal(resolveIdpRedirectUri({ redirectUri: { url: PINNED } }, DERIVED), DERIVED)
})

// The label belongs to the connector ('Authorization callback URL' on GitHub), the NAME is the
// contract: if it drifts, the form writes a key the helpers never read and nothing says so.
test('el campo lleva siempre el nombre del contrato, con la etiqueta que se le pase', () => {
    assert.equal(idpRedirectUriField().name, IDP_REDIRECT_URI_FIELD)
    assert.equal(idpRedirectUriField().label, 'Redirect URI')
    assert.equal(idpRedirectUriField().type, 'text')
    const propia = idpRedirectUriField('Authorization callback URL')
    assert.equal(propia.name, IDP_REDIRECT_URI_FIELD)
    assert.equal(propia.label, 'Authorization callback URL')
})

test('los schemas compartidos ofrecen el campo, una sola vez', () => {
    for (const [nombre, schema] of [['oidc', oidcConfigSchema()], ['oauth2', oauth2ConfigSchema()]] as [string, ReturnType<typeof oidcConfigSchema>][]) {
        const encontrados = schema.filter(f => f.name === IDP_REDIRECT_URI_FIELD)
        assert.equal(encontrados.length, 1, `${nombre}: deberia declararlo exactamente una vez`)
    }
})
