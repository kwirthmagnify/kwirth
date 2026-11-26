import { IClusterRouteTicket } from '@kwirthmagnify/kwirth-common'
import { Cluster } from '../model/Cluster'
import { addPostAuthorization } from './AuthorizationManagement'
import { routersNeedTicket, setRouteTicket } from './ClusterRouting'

/*
    The session's route ticket (plans/router-extension, S3/S4): issued by the user's own core
    (POST /core/routes/ticket) with the session's credential, and asked for again before it expires. The core
    validates it before handing a request to a router; the router learns who is calling from it. It survives a
    restart of the core (it is sealed with the core's masterKey, not kept in its memory), so a restart needs
    nothing from here.

    One ticket for every router: it says who the SESSION is, not which route it may use — that is each
    router's to decide.
*/

const RENEW_BEFORE_MS = 60_000      // asked for again this long before it expires
const RETRY_MS = 15_000             // after a failure

let timer: ReturnType<typeof setTimeout> | undefined
let generation = 0                  // a stop or a restart makes the answers of the previous run worthless

const ticketOf = (value: unknown): IClusterRouteTicket | undefined => {
    const t = value as IClusterRouteTicket | undefined
    return t && typeof t.routeTicket === 'string' && t.routeTicket !== '' && typeof t.expiresAt === 'number' ? t : undefined
}

/*
    Starts (again) asking 'home', the user's own core, for the ticket — only when some router needs it.
    'onTicket' is called every time a ticket arrives, so the entries waiting for it can be read.
*/
export const startRouteTickets = (home: Cluster, onTicket: () => void): void => {
    stopRouteTickets()
    if (!routersNeedTicket()) return
    const mine = generation
    const ask = async (): Promise<void> => {
        let next = RETRY_MS
        try {
            const response = await fetch(`${home.url}/core/routes/ticket`, addPostAuthorization(home.accessString))
            const ticket = response.ok ? ticketOf(await response.json()) : undefined
            if (mine !== generation) return
            if (ticket) {
                setRouteTicket(ticket)
                onTicket()
                next = Math.max(RETRY_MS, ticket.expiresAt - Date.now() - RENEW_BEFORE_MS)
            }
            else {
                console.log(`Route ticket refused by ${home.url}: HTTP ${response.status}`)
            }
        }
        catch (err) {
            console.log(`Route ticket could not be asked for: ${err}`)
        }
        if (mine === generation) timer = setTimeout(() => { void ask() }, next)
    }
    void ask()
}

export const stopRouteTickets = (): void => {
    generation++
    if (timer) clearTimeout(timer)
    timer = undefined
}
