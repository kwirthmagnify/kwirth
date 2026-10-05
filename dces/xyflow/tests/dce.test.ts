// DCE `xyflow`: the object it hands out — React Flow's namespace and elk's constructor.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createXyflowFront } from '../src/front/XyflowDceImpl'
import reactFlowCss from '@xyflow/react/dist/style.css'

test('the instance carries the DCE id', () => {
    assert.equal(createXyflowFront('xyflow').id, 'xyflow')
})

test('reactFlow is the @xyflow/react namespace consumers draw with', () => {
    const { reactFlow } = createXyflowFront('xyflow')
    // What status and iter use from it.
    for (const name of ['ReactFlow', 'Background', 'Controls', 'Handle', 'ReactFlowProvider', 'useReactFlow', 'useNodesState', 'useEdgesState'] as const)
        assert.ok(reactFlow[name] !== undefined, `reactFlow.${name} is missing`)
    assert.equal(reactFlow.MarkerType.ArrowClosed, 'arrowclosed')
    assert.equal(reactFlow.Position.Top, 'top')
})

test('two instances share the same namespaces (one copy on the page)', () => {
    const a = createXyflowFront('xyflow')
    const b = createXyflowFront('xyflow')
    assert.equal(a.reactFlow, b.reactFlow)
})

test('loadElk resolves to a working elk: it lays out a real graph', async () => {
    const ELK = await createXyflowFront('xyflow').loadElk()
    const elk = new ELK()
    const g = await elk.layout({
        id: 'root',
        layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'DOWN' },
        children: [{ id: 'a', width: 100, height: 40 }, { id: 'b', width: 100, height: 40 }],
        edges: [{ id: 'a-b', sources: ['a'], targets: ['b'] }]
    })
    const a = g.children!.find(n => n.id === 'a')!
    const b = g.children!.find(n => n.id === 'b')!
    assert.equal(typeof a.y, 'number')
    // DOWN: the target sits a whole layer below its source.
    assert.ok(b.y! >= a.y! + 40, `b (y=${b.y}) should be below a (y=${a.y})`)
})

test('the stylesheet the factory injects is React Flow\'s', () => {
    assert.ok(reactFlowCss.length > 1000)
    assert.match(reactFlowCss, /\.react-flow/)
})
