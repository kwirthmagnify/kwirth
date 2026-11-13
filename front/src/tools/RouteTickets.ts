import { EInstanceConfigObject, EInstanceConfigView, EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType, IClusterRouteTicket, IInstanceConfig, InstanceConfigScopeEnum } from '@kwirthmagnify/kwirth-common'
import { Cluster } from '../model/Cluster'
import { clusterRouteResolvers, resolverChannelId, setRouteTicket } from './ClusterRouting'
import { RemoteConnection } from './RemoteConnection'

/*
    The route tickets (common/ClusterRoute → IClusterRouteResolver.needsTicket).

    For each resolver that needs one, the front holds a LIVE connection to the resolver's channel on its own
    core, started with the session's credential: the channel decides whether that user may use the route
    and, if so, sends a ticket — and a fresh one before that one expires, over the same socket. Nothing
    here renews anything; when the socket drops, the reconnection brings a new ticket.

    It is the same managed connection the federation uses (tools/RemoteConnection), against the home cluster.
*/

let feeds: RemoteConnection[] = []

// What the channel sends, checked by its shape: anything else on that socket is not a ticket.
const ticketOf = (msg: unknown): IClusterRouteTicket | undefined => {
    const data = (msg as { data?: unknown })?.data as IClusterRouteTicket | undefined
    return data && typeof data.routeTicket === 'string' && data.routeTicket !== '' && typeof data.expiresAt === 'number' ? data : undefined
}

/*
    Starts (again) the ticket feeds against 'home', the user's own core. 'onTicket' is called with the resolver
    id every time a ticket arrives, so that the entries waiting for it can be read.
*/
export const startRouteTickets = (home: Cluster, keepAliveSeconds: () => number, onTicket: (resolverId: string) => void): void => {
    stopRouteTickets()
    for (const resolver of clusterRouteResolvers().filter(r => r.needsTicket)) {
        const channelId = resolverChannelId(resolver.id)
        if (!channelId) continue
        const instanceConfig: IInstanceConfig = {
            channel: channelId,
            objects: EInstanceConfigObject.PODS,
            flow: EInstanceMessageFlow.REQUEST,
            action: EInstanceMessageAction.START,
            instance: '',
            scope: InstanceConfigScopeEnum.NONE,
            accessKey: home.accessString,
            view: EInstanceConfigView.NONE,
            namespace: '',
            group: '',
            pod: '',
            container: '',
            type: EInstanceMessageType.SIGNAL
        }
        const feed = new RemoteConnection(`route-ticket:${resolver.id}`, () => home, instanceConfig, channelId, keepAliveSeconds, {
            onMessage: (_id, msg) => {
                const ticket = ticketOf(msg)
                if (!ticket) return
                setRouteTicket(resolver.id, ticket)
                onTicket(resolver.id)
            },
            onState: () => { /* the entries just wait: a missing ticket is not an error to report */ }
        })
        feeds.push(feed)
        feed.start()
    }
}

export const stopRouteTickets = (): void => {
    for (const feed of feeds) feed.close()
    feeds = []
}
