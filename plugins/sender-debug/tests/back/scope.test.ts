import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { IBackChannelObject, IInstanceConfig } from '@kwirthmagnify/kwirth-common-back'
import SenderDebugChannel from '../../src/back/index'
import { FakeRegistry, MockWs, makeBackObj, makeClusterInfo } from '../helpers'

/*
    La puerta del canal (A12 de auth-hardening), y aquí no es solo mirar: este canal **dispara envíos de
    verdad** por los senders configurados — un correo, un Teams, un Datadog salen de verdad. El core lo
    entregaba a cualquiera que estuviese logado: es `cluster: true`, y esa rama de arranque no mira la
    clave, solo deja un warning.

    La autorización es del CANAL, no del core: el core autentica y entrega la capacidad técnica; qué se
    hace con ella es negocio, y el negocio lo sabe el canal.
*/

const canal = () => {
    const { obj } = makeBackObj()
    return new SenderDebugChannel(makeClusterInfo(new FakeRegistry()), obj as unknown as IBackChannelObject)
}

/** 'id|type|resources', donde el recurso es 'scope:namespace:group:pod:container'. */
const configCon = (accessKey: string | undefined) =>
    ({ instance: 'i1', accessKey, data: { senderId: '', configName: '' } }) as unknown as IInstanceConfig

const arranca = async (accessKey: string | undefined) => {
    const ws = new MockWs()
    const aceptado = await canal().addObject(ws as unknown as WebSocket, configCon(accessKey), '*all', '*all', '*all')
    return { aceptado, ws }
}

describe('scope', () => {
    test('con cluster entra', async () => {
        const { aceptado } = await arranca('tester|permanent|cluster::::')
        assert.equal(aceptado, true)
    })

    test('admin tambien: esta por encima de cluster en la escalera', async () => {
        const { aceptado } = await arranca('tester|permanent|admin,cluster::::')
        assert.equal(aceptado, true)
    })

    test('🔴 sin scopes NO entra, y no se le da el catalogo de senders', async () => {
        const { aceptado, ws } = await arranca('tester|permanent|::::')
        assert.equal(aceptado, false)
        assert.ok(!JSON.stringify(ws.sent).includes('senderdebug-catalogue'), 'no puede salir el catalogo')
    })

    test('🔴 un escalon por debajo (none) tampoco', async () => {
        const { aceptado } = await arranca('tester|permanent|none::::')
        assert.equal(aceptado, false)
    })

    test('🔴 sin accessKey no revienta: deniega', async () => {
        const { aceptado } = await arranca(undefined)
        assert.equal(aceptado, false)
    })

    test('al rechazar dice que scope falta y a quien pedirlo', async () => {
        const { ws } = await arranca('tester|permanent|::::')
        const texto = JSON.stringify(ws.sent)
        assert.match(texto, /cluster/)
        assert.match(texto, /administrator/)
    })
})
