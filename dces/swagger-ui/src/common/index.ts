import type { RequestHandler } from 'express'

/*
    What DCE `swagger-ui` hands its consumers: the page to read and try an OpenAPI document (Swagger UI), served
    by the consumer's own router, with Swagger UI's files inside this DCE. One copy in the core for every extension
    that has an API, instead of 1.5 MB in each of them.

    Consumers take THIS file for the types only (from the published package, or declared locally): at runtime they
    get the instance the core keeps, through getDce<ISwaggerUi>('swagger-ui').

        router.use('/v1/docs', getDce<ISwaggerUi>('swagger-ui').handler({ specUrl: '../openapi.json', title: 'My API' }))

    The handler answers the page at the path it is mounted on (redirecting to the same path with a trailing slash,
    so the page's own files resolve next to it) and Swagger UI's files under it. Anything else is passed on.
*/
export interface ISwaggerUiOptions {
    /** Where the page fetches the OpenAPI document from, absolute or relative to the page (which ends in '/'). */
    specUrl: string
    /** The page's title. */
    title: string
}

export interface ISwaggerUi {
    /** The DCE's id, as the core installed it. */
    id: string
    /** The version of Swagger UI inside. */
    swaggerUiVersion: string
    /** A handler to mount with router.use(path, …). */
    handler(options: ISwaggerUiOptions): RequestHandler
}
