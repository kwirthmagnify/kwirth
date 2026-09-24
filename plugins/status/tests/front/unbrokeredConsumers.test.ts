// Los consumidores que el core no intermedió. Es el numero que decide si el grafo puede presentarse
// como completo o tiene que avisar de que le faltan piezas, asi que lo importante aqui es que NO
// invente: ni cuente huecos como ceros, ni convierta un desfase al reves en un anonimo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { countUnbrokeredConsumers } from '../../src/front/StatusData'
import { EComponentHealth, EComponentKind, IStatusComponent } from '../../src/common/StatusTypes'

const componente = (id: string, campos: Partial<IStatusComponent>): IStatusComponent => ({
    kind: EComponentKind.PROVIDER,
    id,
    displayName: id,
    health: EComponentHealth.ACTIVE,
    ...campos
})

test('sin desfase no hay nada que avisar', () => {
    const componentes = [
        componente('events', { subscribers: 4, knownConsumers: 4 }),
        componente('metrics', { subscribers: 0, knownConsumers: 0 })
    ]
    assert.equal(countUnbrokeredConsumers(componentes), 0)
})

test('lo que el provider reconoce de mas son consumidores que el core no vio', () => {
    const componentes = [
        componente('sugarless', { subscribers: 1, knownConsumers: 0 }),
        componente('situs', { subscribers: 3, knownConsumers: 1 })
    ]
    assert.equal(countUnbrokeredConsumers(componentes), 3)
})

test('un provider que no informa de sus suscriptores no suma: undefined no es cero', () => {
    const componentes = [
        componente('viejo', { knownConsumers: 2 }),                 // no implementa getStats
        componente('events', { subscribers: 5, knownConsumers: 5 })
    ]
    assert.equal(countUnbrokeredConsumers(componentes), 0)
})

test('un componente sin knownConsumers tampoco suma', () => {
    assert.equal(countUnbrokeredConsumers([componente('raro', { subscribers: 7 })]), 0)
})

test('el desfase al reves no produce anonimos negativos', () => {
    // El core registro una arista que el provider ya no cuenta: una baja a medio aplicar, no un anonimo.
    const componentes = [
        componente('trivy', { subscribers: 1, knownConsumers: 3 }),
        componente('events', { subscribers: 2, knownConsumers: 1 })
    ]
    assert.equal(countUnbrokeredConsumers(componentes), 1)
})

test('un inventario vacio da cero, no revienta', () => {
    assert.equal(countUnbrokeredConsumers([]), 0)
})
