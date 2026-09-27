import React from 'react'
import { Box, Chip, Stack, Typography, useTheme } from '@mui/material'
import { ReactFlow, Background, Controls, Node, Edge, MarkerType, Position } from '@xyflow/react'
import { EComponentHealth, EComponentKind, EGraphLayer, IStatusInventory } from '../common/StatusTypes'
import { countUnbrokeredConsumers } from './StatusData'
import { CHANNEL_NODE_PREFIX, channelsOf, consumerNodeId, elkGraphOf, layerOf } from './StatusGraph'

/*
    The map of who produces and who consumes.

    Both ends of every edge come from the CORE (ClusterInfo.getSubscriptions), not from the providers: the
    subscription goes through the core with the channel in front, so both are known there. A provider only
    knows how many subscribers it has, not who they are.

    React Flow and the layout engine come from the globals the core publishes, just as in Iter: they add
    not one byte to this plugin's bundle.
*/

/** The state colours, aligned with the table's chips so there are not two languages. */
const COLOR: Record<EComponentHealth, string> = {
    [EComponentHealth.ACTIVE]: '#2e7d32',
    [EComponentHealth.IDLE]: '#616161',
    [EComponentHealth.INSTANTIATED]: '#2e7d32',
    [EComponentHealth.NOT_INSTANTIATED]: '#ed6c02',
    [EComponentHealth.PENDING_RESTART]: '#ed6c02',
    [EComponentHealth.FAILED]: '#d32f2f',
    [EComponentHealth.UNKNOWN]: '#616161'
}

interface IPosicion {
    x: number
    y: number
}

/**
 * Lays the graph out with elk, which the core serves lazily (~1.4 MB in its own chunk): whoever never
 * opens this view never downloads it.
 *
 * If it fails — it does not load, or the graph is odd — it falls back to two columns. A badly laid out
 * diagram still says who consumes whom; a blank screen does not.
 */
const colocar = async (nodos: Node[], aristas: Edge[]): Promise<Record<string, IPosicion>> => {
    const destinos = new Set(aristas.map(a => a.target))
    // Fallback rows follow the same layers as elk: top, providers that consume providers, channels.
    const filas = (): Record<string, IPosicion> => {
        const pos: Record<string, IPosicion> = {}
        const fila = (n: Node): number => {
            switch (layerOf(n.id, destinos)) {
                case EGraphLayer.FIRST: return 0
                case EGraphLayer.LAST: return 2
                default: return 1
            }
        }
        for (const f of [0, 1, 2]) {
            nodos.filter(n => fila(n) === f).forEach((n, i) => { pos[n.id] = { x: i * 260, y: f * 220 } })
        }
        return pos
    }

    const loadElk = (window as unknown as { __kwirth__?: { loadElk?: () => Promise<unknown> } }).__kwirth__?.loadElk
    if (!loadElk) return filas()

    try {
        const ELK = await loadElk() as new () => { layout(g: unknown): Promise<{ children?: { id: string, x: number, y: number }[] }> }
        const elk = new ELK()
        // The graph elk lays out is built in StatusGraph, where a test runs it through real elk.
        const g = await elk.layout(elkGraphOf(nodos.map(n => n.id), aristas))
        const pos: Record<string, IPosicion> = {}
        for (const c of g.children ?? []) pos[c.id] = { x: c.x, y: c.y }
        return Object.keys(pos).length === nodos.length ? pos : filas()
    }
    catch {
        return filas()
    }
}

interface IDiagramProps {
    inventory: IStatusInventory
    /**
     * Components whose delivery counter CHANGED since the previous refresh. Whoever is not here has
     * moved nothing, or cannot be known.
     */
    active: Set<string>
    /** Seconds between refreshes; 0 = manual. It sets how long the live lines keep moving. */
    autoRefresh: number
}

interface INodoPintado {
    firma: string
    nodo: Node
}

/** Starting speed of a live line, the same as React Flow's stock animation (10 px in 0.5 s). */
const VELOCIDAD_INICIAL = 20

const StatusDiagram: React.FC<IDiagramProps> = ({ inventory, active, autoRefresh }) => {
    const theme = useTheme()
    /*
        How many snapshots have been drawn. Only its PARITY matters: a CSS animation does not start over
        because the element is repainted, but when its name changes. Alternating between two identical
        keyframes, every refresh relaunches the movement even though the line was already alive in the
        previous one.
    */
    const vueltas = React.useRef({ inventario: inventory, n: 0 })
    if (vueltas.current.inventario !== inventory) vueltas.current = { inventario: inventory, n: vueltas.current.n + 1 }
    const frenada = `statusFrenada${vueltas.current.n % 2}`
    // The last object handed to React Flow per node, with the signature of what it draws (see 'colocados').
    const nodosPintados = React.useRef(new Map<string, INodoPintado>())
    const [posiciones, setPosiciones] = React.useState<Record<string, IPosicion> | undefined>(undefined)
    /*
        The selected node. With many nodes, the question stops being "what is there?" and becomes "and
        who does THIS one talk to?" — highlighting its neighbourhood is what makes a dense graph legible.
        The same visual language as Iter's map: the highlighted edge thickens, carries a shadow and rises
        a layer.
    */
    const [seleccionado, setSeleccionado] = React.useState<string | undefined>(undefined)

    /*
        Nodes and edges are derived from the inventory on every render, with no memo: the inventory only
        changes when a new snapshot arrives, and they are a few dozen elements. A useMemo here would hide
        the "the snapshot changed and the graph did not" bug in exchange for nothing measurable.
    */
    /*
        The colours come from the theme, not from constants: this screen is looked at in light and in
        dark, and black nodes on a white ground look like an error even when they are legible.
    */
    const colores = {
        fondoNodo: theme.palette.background.paper,
        fondoCanal: theme.palette.mode === 'dark' ? '#12233a' : '#e8f0fb',
        texto: theme.palette.text.primary,
        bordeCanal: theme.palette.primary.main
    }

    const { nodos, aristas, canalesSueltos } = React.useMemo(() => {
        const productores = inventory.components.filter(c => c.kind === EComponentKind.PROVIDER || c.kind === EComponentKind.PLUVIDER)
        const idsProductores = new Set(productores.map(p => p.id))

        // Channels do not appear in the inventory: they are derived from the edges, where they do appear.
        // A consumer that is a provider is not a channel: its line ends on the provider's own node.
        const canales = channelsOf(inventory.edges)

        /*
            The selected node's neighbourhood: the node itself and everything it touches, both ways.
            What is outside is not hidden, it is DIMMED: it is still there and one can see there is more
            graph around.
        */
        /*
            Activity shows in the LINES, not in the node.

            The node's border once thickened with the accumulated deliveries, and that said little: a
            provider that moved a million on Monday and has been stopped for two days was still the
            fattest in the graph. What matters is that it is moving NOW, and that is the lines it goes out through.
        */
        const vecinos = new Set<string>()
        if (seleccionado) {
            vecinos.add(seleccionado)
            for (const e of inventory.edges) {
                const origen = e.providerId
                const destino = consumerNodeId(e.consumerId)
                if (origen === seleccionado) vecinos.add(destino)
                if (destino === seleccionado) vecinos.add(origen)
            }
        }
        const apagado = (id: string): number => (!seleccionado || vecinos.has(id)) ? 1 : 0.25

        const nodos: Node[] = [
            ...productores.map(p => ({
                id: p.id,
                position: { x: 0, y: 0 },
                /*
                    ONLY what is drawn (or what the layout uses). The subscribers and the health once
                    travelled here without anybody reading them, and since the node is remade when its
                    data changes (see 'colocados'), a counter that varied between snapshots made
                    identical nodes flicker.
                */
                data: { label: p.displayName, esProductor: true },
                // With the graph laid out vertically, an edge has to leave from the BOTTOM and enter at
                // the TOP; otherwise React Flow takes them out sideways and the cables detour absurdly.
                sourcePosition: Position.Bottom,
                targetPosition: Position.Top,
                style: {
                    background: colores.fondoNodo,
                    color: colores.texto,
                    border: `${seleccionado === p.id ? 3 : 2}px solid ${COLOR[p.health]}`,
                    borderRadius: 8,
                    width: 230,
                    fontSize: 12,
                    padding: 8,
                    opacity: apagado(p.id),
                    boxShadow: seleccionado === p.id ? `0 0 10px ${COLOR[p.health]}` : undefined
                }
            })),
            ...canales.map(id => ({
                id: `channel:${id}`,
                position: { x: 0, y: 0 },
                data: { label: id, esProductor: false },
                sourcePosition: Position.Bottom,
                targetPosition: Position.Top,
                style: {
                    background: colores.fondoCanal,
                    color: colores.texto,
                    border: `${seleccionado === `channel:${id}` ? 3 : 2}px solid ${colores.bordeCanal}`,
                    borderRadius: 8,
                    width: 230,
                    fontSize: 12,
                    padding: 8,
                    opacity: apagado(`channel:${id}`),
                    boxShadow: seleccionado === `channel:${id}` ? `0 0 10px ${colores.bordeCanal}` : undefined
                }
            }))
        ]

        const aristas: Edge[] = inventory.edges.map(e => ({
            id: `${e.providerId}->${e.consumerId}`,
            source: e.providerId,
            target: consumerNodeId(e.consumerId),
            /*
                A moving line reads as "something is going through here right now", so it only moves when
                that has been MEASURED (see 'viva'). Still, the only thing it says is that the
                subscription exists. How it slows down with auto-refresh is in the ReactFlow's container.
            */
            ...(() => {
                const tocaAlSeleccionado = Boolean(seleccionado) && (e.providerId === seleccionado || consumerNodeId(e.consumerId) === seleccionado)
                /*
                    Alive = its producer's counter CHANGED between the previous refresh and this one. All
                    of its outgoing edges are animated.

                    ⚠️ What it does NOT say: through which of them it went. That would require counting
                    per edge, and today the counter belongs to the whole provider. A live line means "this
                    component has delivered something and you are one of its consumers", not "N went
                    through here".
                */
                const viva = active.has(e.providerId)
                const color = tocaAlSeleccionado ? '#7fd8b0' : viva ? '#5fc79a' : '#4a8'
                const ancho = tocaAlSeleccionado ? 3 : viva ? 2 : 1
                /*
                    The marker's size is compensated against the line's thickness.

                    React Flow draws the arrowhead with markerUnits="strokeWidth", so its size is
                    MULTIPLIED by the stroke's width: with a thin line the arrow came out tiny and on
                    highlighting it tripled at a stroke. Dividing by the thickness, the head measures the
                    same on screen — about 16 px — and what changes on selecting is the LINE, which is
                    precisely what one wants to highlight.
                */
                const punta = 16 / ancho
                return {
                    // The same highlight as Iter's map: thicker, a glow, and in front of the rest.
                    style: tocaAlSeleccionado
                        ? { stroke: color, strokeWidth: ancho, filter: `drop-shadow(0 0 3px ${color})`, opacity: 1 }
                        : { stroke: color, strokeWidth: ancho, opacity: seleccionado ? 0.2 : 1 },
                    animated: viva,
                    zIndex: tocaAlSeleccionado ? 1000 : viva ? 500 : 0,
                    markerEnd: { type: MarkerType.ArrowClosed, color, width: punta, height: punta }
                }
            })()
        }))
            // Both ends must be drawn: a channel node always is, a provider consumer only if it is installed.
            .filter(e => idsProductores.has(e.source) && (e.target.startsWith(CHANNEL_NODE_PREFIX) || idsProductores.has(e.target)))

        // Edges whose producer is no longer in the inventory: discarded, but counted so it can be said.
        const canalesSueltos = inventory.edges.length - aristas.length

        return { nodos, aristas, canalesSueltos }
        // 'active' goes into the dependencies: otherwise the graph would keep the last set of animations
        // and the lines would never go quiet.
    }, [inventory, active, seleccionado, colores.fondoNodo, colores.fondoCanal, colores.texto, colores.bordeCanal])

    /*
        The layout depends on the INVENTORY, not on the selection: recomputing it on a click would move
        the nodes around under the mouse, which is one of the most disorienting things a graph can do.
        That is why the dependency is the list of ids, not the nodes (which change style on selecting).
    */
    const firmaGrafo = nodos.map(n => n.id).join('|') + '#' + aristas.map(a => a.id).join('|')
    React.useEffect(() => {
        let vigente = true
        colocar(nodos, aristas).then(pos => { if (vigente) setPosiciones(pos) })
        return () => { vigente = false }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [firmaGrafo])

    // Consumers the core did not broker: they get stated, not drawn — nobody knows who they are.
    const anonimos = countUnbrokeredConsumers(inventory.components)

    /*
        With no edges there are two VERY different situations, and saying the same sentence in both
        means lying in one of them: either nobody is really consuming, or whoever consumes subscribed
        by talking straight to the provider, skipping the core. In the second case the figure does
        exist — providers do acknowledge their subscribers — and the only thing missing is WHO they
        are, which is precisely what the core never saw.
    */
    if (inventory.edges.length === 0) {
        return (
            <Box sx={{ p: 3 }}>
                <Typography variant='body2' color='text.secondary'>
                    {anonimos > 0
                        ? `There is consumption right now — ${anonimos} subscriber${anonimos > 1 ? 's' : ''} — but no graph to draw: `
                          + 'they subscribed straight to the provider instead of going through the core, so nobody knows who they are. '
                          + 'The table still shows how much each producer is delivering.'
                        : 'Nothing is subscribed to anything right now, so there is no graph to draw.'}
                </Typography>
            </Box>
        )
    }

    if (!posiciones) {
        return <Box sx={{ p: 3 }}><Typography variant='body2' color='text.secondary'>Laying out the graph…</Typography></Box>
    }

    /*
        Without this, every refresh was a FLASH of the whole graph even when nothing had changed.

        React Flow reuses a node only when it receives the SAME object; if a new one arrives, it clears
        its measurements and hides it until it measures it again — and every snapshot regenerates all the
        nodes. So the object is kept as long as what is drawn of it (data, style, position) is the same,
        and only the node that really changed is remade.
    */
    const colocados = nodos.map(n => {
        const position = posiciones[n.id] ?? { x: 0, y: 0 }
        const firma = JSON.stringify([n.data, n.style, position])
        const previo = nodosPintados.current.get(n.id)
        if (previo?.firma === firma) return previo.nodo
        const nodo = { ...n, position }
        nodosPintados.current.set(n.id, { firma, nodo })
        return nodo
    })

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Stack direction='row' spacing={1} alignItems='center' sx={{ mb: 1 }}>
                {/*
                    La leyenda no es adorno: sin ella, cada quien decide por su cuenta qué significa una
                    línea, y lo natural es suponer que significa tráfico.
                */}
                <Typography variant='caption' color='text.secondary'>
                    A line means <b>an active subscription</b>. A <b>moving line</b> means its producer is
                    delivering right now — but not how much goes to each consumer: that is measured per
                    component, not per line.
                    {' '}Click a node to highlight what it is connected to; click the background to clear.
                </Typography>
            </Stack>
            {(anonimos > 0 || canalesSueltos > 0) && (
                <Stack direction='row' spacing={1} sx={{ mb: 1 }}>
                    {anonimos > 0 && (
                        <Chip size='small' variant='outlined' color='default'
                            label={`${anonimos} consumer${anonimos > 1 ? 's' : ''} not shown — they subscribed without going through the core`} />
                    )}
                    {canalesSueltos > 0 && (
                        <Chip size='small' variant='outlined' label={`${canalesSueltos} subscription${canalesSueltos > 1 ? 's' : ''} to something no longer installed`} />
                    )}
                </Stack>
            )}
            {/*
                Los controles de React Flow vienen con fondo y flechas BLANCOS de su propia hoja de
                estilos, que el core carga tal cual. Sobre el tema oscuro eso es un cuadrado blanco con
                iconos invisibles. Se repintan con los colores del tema —no con valores fijos— para que
                sirvan igual en claro y en oscuro.
            */}
            <Box sx={{
                flex: 1, minHeight: 0, border: 1, borderColor: 'divider', borderRadius: 1,
                '& .react-flow__controls': { boxShadow: 'none' },
                '& .react-flow__controls-button': {
                    background: theme.palette.background.paper,
                    borderBottom: `1px solid ${theme.palette.divider}`,
                    fill: theme.palette.text.primary
                },
                '& .react-flow__controls-button:hover': { background: theme.palette.action.hover },
                '& .react-flow__controls-button svg': { fill: theme.palette.text.primary },
                '& .react-flow__attribution': { display: 'none' },
                /*
                    With auto-refresh, the live line starts at the default speed and SLOWS DOWN until it
                    stops right when the next snapshot arrives: what has been seen moving is what happened
                    in that interval, and the line does not go on saying "now" when the data is already
                    stale. In manual there is no interval to run out, so the default continuous animation stays.

                    The distance comes out of the curve: with a quadratic ease-out the initial speed is
                    2·D/T, so D = INITIAL_SPEED·T/2 starts the same as the default one, with no jolt.
                */
                ...(autoRefresh > 0 ? {
                    [`@keyframes ${frenada}`]: {
                        from: { strokeDashoffset: VELOCIDAD_INICIAL * autoRefresh / 2 },
                        to: { strokeDashoffset: 0 }
                    },
                    '& .react-flow__edge.animated path': {
                        animation: `${frenada} ${autoRefresh}s cubic-bezier(0.5, 1, 0.89, 1) 1 forwards`
                    }
                } : {})
            }}>
                {/*
                    SOLO VISUALIZACION. React Flow es un editor de grafos, asi que de serie deja tirar
                    de un nodo y crear una arista, reengancharlas y borrarlas con Supr. Aqui eso no
                    significa nada —la topologia la deciden las suscripciones reales, no este dibujo— y
                    peor aun: sugiere que se esta cambiando algo. Se desactiva todo lo que edita.

                    Mover y hacer zoom SI se dejan: no alteran nada y son justo lo que hace falta para
                    leer un grafo con muchos nodos.
                */}
                <ReactFlow
                    nodes={colocados}
                    edges={aristas}
                    fitView
                    proOptions={{ hideAttribution: true }}
                    nodesConnectable={false}
                    edgesReconnectable={false}
                    connectOnClick={false}
                    deleteKeyCode={null}
                    onNodeClick={(_e, nodo) => setSeleccionado(nodo.id)}
                    // Clicking the background = clear the selection. Without this there would be no way
                    // to see everything again short of closing the tab.
                    onPaneClick={() => setSeleccionado(undefined)}
                >
                    <Background />
                    <Controls showInteractive={false} />
                </ReactFlow>
            </Box>
        </Box>
    )
}

export { StatusDiagram }
