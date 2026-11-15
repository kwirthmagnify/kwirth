import { AccessKey, IConfigFieldDef, IExtensionScope, IRouterData } from '@kwirthmagnify/kwirth-common'
import { Request, Response } from 'express'
import { IncomingMessage } from 'http'
import { IExtension, IExtensionLogger } from './IExtension'

/*
    ROUTER — an extension whose only job is carrying the core's traffic to a cluster that cannot be reached
    directly (behind NAT, a firewall, a DMZ). Back-end only: no tab, no panel. It is configured with the
    core's generic dialog (from getConfigSchema) and it speaks through the core's log.

    How the traffic reaches it:
      · a cluster-list entry keeps the cluster's real url plus a ROUTE { resolver: <router id>, clusterUid };
      · every request and WebSocket for that cluster goes to <rootPath>/router/<id>/... of THIS core;
      · the core AUTHENTICATES it (route ticket, access key or loopback) and hands it to the router with
        who is calling (IRouteCaller). The router AUTHORIZES it and carries it, however it likes.

    Installing, updating and uninstalling a router needs no restart: the core mounts one dispatcher and
    looks the live router up on every request.

    A plugin that is also a router (it has a panel of its own) is a PLUTER: it implements IChannel and this.
    Plan: plans/router-extension/PRD.md.
*/

// How the core authenticated a request before handing it to a router
export enum ERouteCallerVia {
    TICKET = 'ticket',              // a route ticket in the path (a browser)
    ACCESS_KEY = 'accesskey',       // an access key in the Authorization header (another core's back, a script)
    LOOPBACK = 'loopback'           // this core's own back, through the route (openRemoteChannel); loopback only
}

// Who is calling, already authenticated by the core. What the caller may do through the route is the router's to decide.
export interface IRouteCaller {
    via: ERouteCallerVia
    accessKey?: AccessKey           // the validated key (absent for LOOPBACK)
    user?: string                   // the user it belongs to, when the key is a user's
}

// The router's config: the values of the fields it declares in getConfigSchema, as saved (secrets included, real)
export type TRouterConfig = Record<string, unknown>

// What a router says about itself in the Routers manager (optional)
export interface IRouterStatus {
    started: boolean
    lastError?: string
    detail?: string                 // one line: what it is doing now (e.g. 'linked to <peer>')
}

// What the core gives a router when it creates it
export interface IRouterContext {
    clusterUid: string              // this Kwirth's cluster uid ('' when unknown)
    clusterName: string
    kwirthVersion: string
    /*
        This core over loopback, e.g. 'http://localhost:3883/kwirth': where a router delivers what arrives
        for THIS cluster, so that the core authenticates and authorizes it as it always does.
    */
    loopbackUrl: string
    logger: IExtensionLogger        // its lines come out with the ROUTER component and its id
}

export interface IRouter extends IExtension {
    // Its id (= the extension's id), its path template and whether it needs a route ticket
    getRouterData(): IRouterData

    /*
        An HTTP request under <rootPath>/router/<id>/, already authenticated. 'req.url' is the path BELOW
        /router/<id> (an express Router can be handed req and res as they come). Optional: a router that
        only carries WebSockets leaves it out and the core answers 404.
    */
    routerRequest?(req: Request, res: Response, caller: IRouteCaller): void

    /*
        A WebSocket under <rootPath>/router/<id>/, already authenticated, handed over as soon as it connects.
        From then on the socket is the router's. 'req' is the upgrade request (full path, query, headers,
        remote address). Optional: without it, such upgrades are refused.
    */
    routerWebsocket?(webSocket: WebSocket, req: IncomingMessage, caller: IRouteCaller): void

    // The fields of its configuration dialog (the generic one). 'password' fields are kept in a Secret.
    getConfigSchema(): IConfigFieldDef[]

    // The scopes it declares (e.g. 'bridge$peer'), for the security editor. Optional.
    getScopeCatalog?(): IExtensionScope[]

    // Started once, with its saved config (empty object when never configured)
    startRouter(config: TRouterConfig): Promise<void>

    // The config was saved from the Routers manager: apply it now, without a restart
    applyConfig(config: TRouterConfig): Promise<void>

    // Uninstalled, updated or the core is stopping: close everything it opened
    stopRouter(): Promise<void>

    // What the Routers manager shows. Optional.
    getStatus?(): IRouterStatus
}

export type TRouterConstructor = new (context: IRouterContext) => IRouter
