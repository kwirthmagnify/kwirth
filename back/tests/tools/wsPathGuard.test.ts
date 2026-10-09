import test from 'node:test'
import assert from 'node:assert/strict'
import { wsUpgradeAllowed } from '../../src/tools/WsPathGuard'

/*
    Qué rutas admiten un upgrade a WebSocket.

    🔴 Nace de un caso real (2026-10-09): un ingress con `path: /kwirth` y `pathType: Prefix` —que por
    especificación casa por SEGMENTOS— dejaba pasar `/kwirth2` y `/kwirthXYZ` porque nginx lo había
    traducido a un prefijo de cadena. El servidor WS no miraba la ruta, así que el canal se abría por
    todas ellas: el `GET /kwirth2` daba 404 y el WebSocket se aceptaba igual.
*/

test('🔴 una ruta que EMPIEZA igual no es una subruta', () => {
    assert.equal(wsUpgradeAllowed('/kwirth2', '/kwirth'), false)
    assert.equal(wsUpgradeAllowed('/kwirthXYZ', '/kwirth'), false)
    assert.equal(wsUpgradeAllowed('/kwirth2/version', '/kwirth'), false)
    assert.equal(wsUpgradeAllowed('/kwirth-otro', '/kwirth'), false)
})

test('la ruta propia y sus subrutas se aceptan', () => {
    assert.equal(wsUpgradeAllowed('/kwirth', '/kwirth'), true)
    assert.equal(wsUpgradeAllowed('/kwirth/', '/kwirth'), true)
    assert.equal(wsUpgradeAllowed('/kwirth/channel', '/kwirth'), true)
    assert.equal(wsUpgradeAllowed('/kwirth/sub/path', '/kwirth'), true)
})

test('la query y el fragmento no cuentan: el canal los usa (challenge)', () => {
    assert.equal(wsUpgradeAllowed('/kwirth?challenge=abc123', '/kwirth'), true)
    assert.equal(wsUpgradeAllowed('/kwirth/x?challenge=abc', '/kwirth'), true)
    // Y no se cuelan por la query: lo que manda es el pathname.
    assert.equal(wsUpgradeAllowed('/kwirth2?challenge=abc', '/kwirth'), false)
})

test('sin rootPath NO se filtra — es el caso del ingress que reescribe', () => {
    // Con rewrite-target al servidor le llega la ruta recortada y no hay nada contra lo que comparar.
    // Filtrar ahí rompería esos despliegues, y además no hay agujero: no existe prefijo que escapar.
    for (const root of ['', '/']) {
        assert.equal(wsUpgradeAllowed('/', root), true)
        assert.equal(wsUpgradeAllowed('/loquesea', root), true)
        assert.equal(wsUpgradeAllowed(undefined, root), true)
    }
})

test('rootPath con barra final se trata igual que sin ella', () => {
    assert.equal(wsUpgradeAllowed('/kwirth', '/kwirth/'), true)
    assert.equal(wsUpgradeAllowed('/kwirth/x', '/kwirth/'), true)
    assert.equal(wsUpgradeAllowed('/kwirth2', '/kwirth/'), false)
})

test('rootPath de varios segmentos', () => {
    assert.equal(wsUpgradeAllowed('/apps/kwirth/x', '/apps/kwirth'), true)
    assert.equal(wsUpgradeAllowed('/apps/kwirth2', '/apps/kwirth'), false)
    assert.equal(wsUpgradeAllowed('/apps', '/apps/kwirth'), false)
})
