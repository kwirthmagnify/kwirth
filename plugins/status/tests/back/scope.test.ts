import { test } from 'node:test'
import assert from 'node:assert/strict'
import { StatusChannel } from '../../src/back/index'
import { EStatusPayload, IStatusMessageResponse } from '../../src/common/StatusTypes'

/*
    La puerta del canal (A12 de auth-hardening).

    Status declaraba desde el principio, en el comentario de `getChannelScopeLevel`, que el mínimo para
    ver el inventario es 'cluster' — y no lo comprobaba nadie. El core entrega este canal a cualquiera
    que esté logado: es `cluster: true`, y esa rama de arranque no mira la clave. La autorización es del
    CANAL, no del core: el core autentica y entrega la capacidad técnica, y qué se sirve con ella es
    negocio del canal.

    Lo que se protege no es poca cosa: el inventario enumera todas las extensiones montadas con su
    estado, las rutas HTTP publicadas y el pool SQL. Es el mapa de la instalación.

    El log del core NO se prueba aquí porque no lo sirve este canal: lo sirve `/managekwirth/log`, que
    exige 'admin' y responde 403. El `isAdmin` del front es UX, no una puerta.
*/

interface IEnviado { mensajes: IStatusMessageResponse[] }

const socketFalso = (enviado: IEnviado) => ({
    send: (raw: string) => { enviado.mensajes.push(JSON.parse(raw)) }
}) as unknown as WebSocket

/** 'id|type|resources', y el recurso es 'scope:namespace:group:pod:container'. */
const clave = (resources: string) => `k1|permanent|${resources}`

const arranca = async (accessKey: string | undefined) => {
    const enviado: IEnviado = { mensajes: [] }
    const canal = new StatusChannel({ name: 'c1', providers: [] } as never, {} as never)
    const aceptado = await canal.addObject(socketFalso(enviado), { instance: 'i1', accessKey } as never, '', '', '')
    return { aceptado, enviado }
}

test('con scope cluster se sirve el inventario', async () => {
    const { aceptado, enviado } = await arranca(clave('cluster::::'))
    assert.equal(aceptado, true)
    assert.ok(enviado.mensajes.some(m => m.payloadType === EStatusPayload.INVENTORY), 'tendría que haber llegado la foto')
})

test('admin tambien entra: esta por encima de cluster en la escalera', async () => {
    const { aceptado } = await arranca(clave('admin,cluster::::'))
    assert.equal(aceptado, true)
})

test('🔴 una clave SIN scopes no ve el inventario, aunque este logada', async () => {
    const { aceptado, enviado } = await arranca(clave('::::'))
    assert.equal(aceptado, false)
    assert.ok(!enviado.mensajes.some(m => m.payloadType === EStatusPayload.INVENTORY),
        'el inventario no puede salir: enumera todas las extensiones montadas')
})

test('🔴 un scope por debajo (none) tampoco: la escalera se respeta', async () => {
    const { aceptado } = await arranca(clave('none::::'))
    assert.equal(aceptado, false)
})

test('🔴 sin accessKey no se sirve nada, y no revienta', async () => {
    const { aceptado, enviado } = await arranca(undefined)
    assert.equal(aceptado, false)
    assert.ok(!enviado.mensajes.some(m => m.payloadType === EStatusPayload.INVENTORY))
})

test('al rechazar, se dice POR QUE y que scope hace falta', async () => {
    const { enviado } = await arranca(clave('::::'))
    const texto = JSON.stringify(enviado.mensajes)
    assert.match(texto, /cluster/, 'el mensaje tiene que nombrar el scope que falta')
    assert.match(texto, /administrator/, 'y a quien pedirselo')
})
