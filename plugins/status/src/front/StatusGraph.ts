import { EGraphLayer, IStatusEdge, PROVIDER_CONSUMER_PREFIX } from '../common/StatusTypes'

/*
    How the graph turns edges into nodes and layers. Kept apart from the component so the decisions
    can be tested without React Flow or elk.

    A consumer is either a channel or, since a provider can subscribe to another one, a provider. A
    channel gets its own node ('channel:<id>'); a provider consumer IS the provider node that is already
    in the graph as a producer, so the line ends on it instead of on a copy of it.
*/

/** The prefix of a channel node id: channels are not in the inventory, they come from the edges. */
export const CHANNEL_NODE_PREFIX = 'channel:'

export const isProviderConsumer = (consumerId: string): boolean => consumerId.startsWith(PROVIDER_CONSUMER_PREFIX)

/** The node an edge ends on: the provider itself for a provider consumer, a channel node otherwise. */
export const consumerNodeId = (consumerId: string): string =>
    isProviderConsumer(consumerId)
        ? consumerId.slice(PROVIDER_CONSUMER_PREFIX.length)
        : `${CHANNEL_NODE_PREFIX}${consumerId}`

/** The channels to draw: every consumer that is not a provider, once. */
export const channelsOf = (edges: IStatusEdge[]): string[] =>
    [...new Set(edges.filter(e => !isProviderConsumer(e.consumerId)).map(e => e.consumerId))]

/*
    The layer a node is pinned to, so no line ever goes back up:

      - a channel only consumes, so it goes to the LAST layer, with every other channel;
      - a producer that consumes nothing goes to the FIRST layer;
      - a producer that consumes another producer is NOT pinned: elk's layering puts it below
        whatever it consumes, as deep as the chain needs (A, B on top; C that reads B below them).

    Pinning every producer to the first layer, as before, is what would make the line from B to C go
    sideways or back up.

    'targets' are the node ids the DRAWN lines end on: an edge dropped because one of its ends is not
    installed must not unpin anybody.
*/
export const layerOf = (nodeId: string, targets: Set<string>): EGraphLayer | undefined => {
    if (nodeId.startsWith(CHANNEL_NODE_PREFIX)) return EGraphLayer.LAST
    return targets.has(nodeId) ? undefined : EGraphLayer.FIRST
}

/** A drawn line, as much of it as the layout needs (React Flow's Edge has this shape). */
export interface IGraphLine {
    id: string
    source: string
    target: string
}

/** What elk takes: its node, edge and graph, reduced to the fields this graph uses. */
export interface IElkNode {
    id: string
    width: number
    height: number
    layoutOptions?: Record<string, string>
}

export interface IElkEdge {
    id: string
    sources: string[]
    targets: string[]
}

export interface IElkGraph {
    id: string
    layoutOptions: Record<string, string>
    children: IElkNode[]
    edges: IElkEdge[]
}

/**
 * The graph handed to elk. Built here, and not inside the component, so a test can run it through the
 * real elk and check the positions: the layer rules only matter if elk honours them.
 */
export const elkGraphOf = (nodeIds: string[], lines: IGraphLine[]): IElkGraph => {
    const targets = new Set(lines.map(l => l.target))
    return {
        id: 'root',
        layoutOptions: {
            'elk.algorithm': 'layered',
            /*
                De arriba abajo: los productores en la capa de arriba y los consumidores debajo.
                Se lee como un diagrama de flujo —el dato cae— y aprovecha el ancho de la pantalla,
                que es donde sobra sitio cuando hay muchos nodos.
            */
            'elk.direction': 'DOWN',
            'elk.spacing.nodeNode': '40',
            'elk.layered.spacing.nodeNodeBetweenLayers': '110',
            /*
                UN solo grafo, no uno por componente. De serie elk coloca cada componente conexo por
                su cuenta y luego los apila: un par suelto como sugarless -> sugarless salia en su
                propio bloque de dos filas, con su canal por ENCIMA de productores del bloque grande.
            */
            'elk.separateConnectedComponents': 'false'
        },
        /*
            The layer of each node (see layerOf): channels at the bottom, producers that consume nothing
            at the top, and a provider that consumes another provider left free, so elk puts it below
            what it reads and every line goes down.
        */
        children: nodeIds.map(id => {
            const layer = layerOf(id, targets)
            return {
                id,
                width: 230,
                height: 56,
                ...(layer ? { layoutOptions: { 'elk.layered.layering.layerConstraint': layer } } : {})
            }
        }),
        edges: lines.map(l => ({ id: l.id, sources: [l.source], targets: [l.target] }))
    }
}
