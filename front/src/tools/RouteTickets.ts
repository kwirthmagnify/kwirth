import { IClusterRouteTicket } from '@kwirthmagnify/kwirth-common'
import { Cluster } from '../model/Cluster'
import { addPostAuthorization } from './AuthorizationManagement'
import { routersNeedTicket, setRouteTicket } from './ClusterRouting'

/*
    The session's route ticket (plans/router-extension, S3/S4): issued by the user's own core
    (POST /core/routes/ticket) with the session's credential, and asked for again before it expires. The core
    validates it before handing a request to a router; the router learns who is calling from it.

    One ticket for every router: it says who the SESSION is, not which route it may use — that is each
    router's to decide.
*/

export const ROUTE_REFUSED_CLOSE_CODE = 4401   // how the core closes a route WebSocket it does not authenticate
const RENEW_BEFORE_MS = 60_000      // asked for again this long before it expires
const RETRY_MS = 15_000             // after a failure

let timer: ReturnType<typeof setTimeout> | undefined
let generation = 0                  // a stop or a restart makes the answers of the previous run worthless
// what renewRouteTicketNow asks again with: the run in course, if any
let runningHome: Cluster | undefined
let runningOnTicket: (() => void) | undefined

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
    runningHome = home
    runningOnTicket = onTicket
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

/*
    The core refused the ticket (4401) although it has not expired here: the core restarted, and its tickets,
    which live in its memory, went with it. Asked for again NOW instead of when it would have been renewed
    (up to 9 minutes later), so the reconnection that comes next carries a ticket the core knows.
*/
export const renewRouteTicketNow = (): void => {
    if (!runningHome || !runningOnTicket) return
    setRouteTicket(undefined)
    startRouteTickets(runningHome, runningOnTicket)
}

export const stopRouteTickets = (): void => {
    runningHome = undefined
    runningOnTicket = undefined
    generation++
    if (timer) clearTimeout(timer)
    timer = undefined
}
