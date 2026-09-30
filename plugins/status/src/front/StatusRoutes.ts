import { ERouteOwnerKind, IPublishedRoute } from '@kwirthmagnify/kwirth-common'

/*
    The Routes tab's logic, apart from the component so it can be tested: order, filter, counts and — the
    finding that matters — collisions.

    A COLLISION is the same method at the same path published by two different owners. Express answers
    with whichever was mounted first and the other is silently unreachable. The core records both instead
    of rejecting one (rejecting is pending), so this is where it becomes visible.
*/

/** How each owner kind is named on screen, in the order the table groups them. */
export const OWNER_LABEL: Record<ERouteOwnerKind, string> = {
    [ERouteOwnerKind.CORE]: 'Core',
    [ERouteOwnerKind.PROVIDER]: 'Provider',
    [ERouteOwnerKind.CHANNEL]: 'Plugin',
    [ERouteOwnerKind.WEBHOOK]: 'Webhook',
    [ERouteOwnerKind.LOGIN]: 'Login',
    [ERouteOwnerKind.FRONT]: 'Front',
    [ERouteOwnerKind.OTHER]: 'Other'
}

const OWNER_ORDER: ERouteOwnerKind[] = Object.keys(OWNER_LABEL) as ERouteOwnerKind[]

const key = (r: IPublishedRoute): string => `${r.method} ${r.path}`

/**
 * The 'METHOD path' pairs published by more than one owner. ALL answers every method, so an ALL and a
 * GET at the same path collide too.
 */
export const collisions = (routes: IPublishedRoute[]): Set<string> => {
    const owners = new Map<string, Set<string>>()
    const byPath = new Map<string, IPublishedRoute[]>()
    for (const r of routes) {
        const list = byPath.get(r.path) ?? []
        list.push(r)
        byPath.set(r.path, list)
    }
    for (const list of byPath.values()) {
        for (const r of list) {
            for (const other of list) {
                if (`${other.ownerKind}:${other.ownerId}` === `${r.ownerKind}:${r.ownerId}`) continue
                if (other.method !== r.method && other.method !== 'ALL' && r.method !== 'ALL') continue
                const set = owners.get(key(r)) ?? new Set<string>()
                set.add(`${r.ownerKind}:${r.ownerId}`)
                set.add(`${other.ownerKind}:${other.ownerId}`)
                owners.set(key(r), set)
            }
        }
    }
    return new Set([...owners.entries()].filter(([, s]) => s.size > 1).map(([k]) => k))
}

export const isColliding = (route: IPublishedRoute, clashes: Set<string>): boolean => clashes.has(key(route))

/** By owner kind (Core first), then path, then method: the same order every time, so it can be scanned. */
export const sortRoutes = (routes: IPublishedRoute[]): IPublishedRoute[] =>
    [...routes].sort((a, b) =>
        OWNER_ORDER.indexOf(a.ownerKind) - OWNER_ORDER.indexOf(b.ownerKind)
        || a.path.localeCompare(b.path)
        || a.method.localeCompare(b.method))

/** One line of the Routes table: a path of one owner, with every method it answers there. */
export interface IRouteLine {
    ownerKind: ERouteOwnerKind
    ownerId: string
    path: string
    methods: string[]
    /** True when any of its methods collides with another owner's at the same path. */
    colliding: boolean
}

// The order methods are shown in on a line: reads like the usual CRUD, ALL last.
const METHOD_ORDER = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'ALL']
const methodRank = (m: string): number => {
    const i = METHOD_ORDER.indexOf(m)
    return i < 0 ? METHOD_ORDER.length : i
}

/*
    One line per path and owner, with its methods together. Two owners at the same path stay on two lines:
    they are two different things — and that is exactly the collision the line is flagged with.
*/
export const toLines = (routes: IPublishedRoute[]): IRouteLine[] => {
    const clashes = collisions(routes)
    const lines = new Map<string, IRouteLine>()
    for (const r of sortRoutes(routes)) {
        const id = `${r.ownerKind}:${r.ownerId} ${r.path}`
        const line = lines.get(id) ?? { ownerKind: r.ownerKind, ownerId: r.ownerId, path: r.path, methods: [], colliding: false }
        if (!line.methods.includes(r.method)) line.methods.push(r.method)
        line.colliding = line.colliding || isColliding(r, clashes)
        lines.set(id, line)
    }
    for (const line of lines.values()) line.methods.sort((a, b) => methodRank(a) - methodRank(b))
    return [...lines.values()]
}

/** Matches the path, the owner id, the owner kind's label, or EXACTLY one of the line's methods. */
export const filterLines = (lines: IRouteLine[], text: string): IRouteLine[] => {
    const f = text.trim().toLowerCase()
    if (!f) return lines
    return lines.filter(l =>
        l.path.toLowerCase().includes(f) || l.ownerId.toLowerCase().includes(f)
        || OWNER_LABEL[l.ownerKind].toLowerCase().includes(f)
        || l.methods.some(m => m.toLowerCase() === f))
}

/** How many routes each owner kind published, only for the kinds that have some. */
export const countByOwner = (routes: IPublishedRoute[]): [ERouteOwnerKind, number][] =>
    OWNER_ORDER.map(k => [k, routes.filter(r => r.ownerKind === k).length] as [ERouteOwnerKind, number]).filter(([, n]) => n > 0)
