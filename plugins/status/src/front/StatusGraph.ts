import { IStatusEdge, PROVIDER_CONSUMER_PREFIX } from '../common/StatusTypes'

/*
    How the graph turns edges into nodes and layers. Kept apart from the component so the decisions
    can be tested without React Flow or elk.

    ONE node per thing that exists:
      - a provider is its own node (its id);
      - a plugin is ONE node ('channel:<id>'), whether it consumes, publishes (a pluvider, 'plugin:<id>'
        on the producer side) or both. Drawing the pluvider apart from its channel showed the same plugin
        twice — a producer that looked like one more provider, and the channel below it;
      - a provider that consumes another provider ('provider:<id>' on the consumer side) IS that
        provider's node, so the line ends on it instead of on a copy of it.
*/

/** The prefix of a channel node id: channels are not in the inventory, they come from the edges. */
export const CHANNEL_NODE_PREFIX = 'channel:'

/** How the core names a pluvider: the plugin's id behind this prefix (the core's pluviderId()). */
export const PLUVIDER_PREFIX = 'plugin:'

export const isProviderConsumer = (consumerId: string): boolean => consumerId.startsWith(PROVIDER_CONSUMER_PREFIX)

export const isPluviderId = (producerId: string): boolean => producerId.startsWith(PLUVIDER_PREFIX)

/** The node an edge ends on: the provider itself for a provider consumer, the plugin's node otherwise. */
export const consumerNodeId = (consumerId: string): string =>
    isProviderConsumer(consumerId)
        ? consumerId.slice(PROVIDER_CONSUMER_PREFIX.length)
        : `${CHANNEL_NODE_PREFIX}${consumerId}`

/** The node an edge starts from: a pluvider's lines leave its PLUGIN's node, a provider's its own. */
export const producerNodeId = (producerId: string): string =>
    isPluviderId(producerId)
        ? `${CHANNEL_NODE_PREFIX}${producerId.slice(PLUVIDER_PREFIX.length)}`
        : producerId

/**
 * The plugins to draw, each once: every consumer that is not a provider, and every pluvider — a plugin
 * that publishes is drawn even when it consumes nothing.
 */
export const channelsOf = (edges: IStatusEdge[], pluviderIds: string[] = []): string[] => [...new Set([
    ...edges.filter(e => !isProviderConsumer(e.consumerId)).map(e => e.consumerId),
    ...pluviderIds.filter(isPluviderId).map(p => p.slice(PLUVIDER_PREFIX.length))
])]

/** A drawn line, as much of it as the layout needs (React Flow's Edge has this shape). */
export interface IGraphLine {
    id: string
    source: string
    target: string
}

/*
    The layer of every node, as the depth of what it consumes, so the graph grows DOWNWARDS: a node that
    consumes nothing is on layer 0; whoever consumes it, one below; whoever consumes THAT one, one more…
    That is, the longest path from a node that consumes nothing. Every line goes down, and a consumer sits
    right below the deepest thing it reads, not at the bottom of the screen with every other channel.

    A cycle (A reads B and B reads A) has no longest path: the relaxation stops after as many rounds as
    there are nodes, so it ends whatever the graph, and no depth goes past the deepest a real path can be
    (one less than the number of nodes) — a cycle would otherwise push it one further every round.
*/
export const depthOf = (nodeIds: string[], lines: IGraphLine[]): Map<string, number> => {
    const depth = new Map(nodeIds.map(id => [id, 0]))
    const deepest = Math.max(0, nodeIds.length - 1)
    const drawn = lines.filter(l => depth.has(l.source) && depth.has(l.target) && l.source !== l.target)
    for (let round = 0; round < nodeIds.length; round++) {
        let changed = false
        for (const l of drawn) {
            const below = Math.min(depth.get(l.source)! + 1, deepest)
            if (below > depth.get(l.target)!) {
                depth.set(l.target, below)
                changed = true
            }
        }
        if (!changed) break
    }
    return depth
}

/** What elk takes: its node, edge and graph, reduced to the fields this graph uses. */
export interface IElkNode {
    id: string
    width: number
    height: number
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
 * real elk and check the positions: the layer rule only matters if elk honours it.
 */
export const elkGraphOf = (nodeIds: string[], lines: IGraphLine[]): IElkGraph => ({
    id: 'root',
    layoutOptions: {
        'elk.algorithm': 'layered',
        /*
            Top down: the producers on the top layer and the consumers below. It reads like a flow
            diagram — the data falls — and it makes use of the screen's width, which is where there is
            room to spare when there are many nodes.
        */
        'elk.direction': 'DOWN',
        /*
            Layers by the longest path FROM the sources — exactly depthOf: a node goes one layer below the
            deepest thing it consumes. elk's default (network simplex) shortens lines instead, and could
            leave a lone consumer level with something it does not read.
        */
        'elk.layered.layering.strategy': 'LONGEST_PATH_SOURCE',
        'elk.spacing.nodeNode': '40',
        'elk.layered.spacing.nodeNodeBetweenLayers': '110',
        /*
            ONE single graph, not one per component. By default elk lays out each connected component
            on its own and then stacks them: a loose pair like sugarless -> sugarless came out in its
            own two-row block.
        */
        'elk.separateConnectedComponents': 'false'
    },
    children: nodeIds.map(id => ({ id, width: 230, height: 56 })),
    edges: lines.map(l => ({ id: l.id, sources: [l.source], targets: [l.target] }))
})
