/*
    The HTTP routes this Kwirth has published, as the core lends them to channels (ClusterInfo.routes;
    the Status channel's Routes tab). Shared so the core, which records them, and whoever reads them agree
    on one type — before, the reader kept a mirror of the enum that had to be kept equal by hand.
*/

/** Who published a route. */
export enum ERouteOwnerKind {
    CORE = 'core',
    CHANNEL = 'channel',
    PROVIDER = 'provider',
    LOGIN = 'login',
    WEBHOOK = 'webhook',
    FRONT = 'front',
    OTHER = 'other'
}

/** One published route: who owns it, its method and its full path — a PATTERN, never a value. */
export interface IPublishedRoute {
    ownerKind: ERouteOwnerKind
    ownerId: string
    method: string
    path: string
}

/** What channels see of the core's route registry (ClusterInfo.routes). */
export interface IRouteAccess {
    listRoutes(): IPublishedRoute[]
}
