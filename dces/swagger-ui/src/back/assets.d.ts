// The virtual module assets-plugin.mjs builds at bundle time: Swagger UI's files, as text.
declare module 'swagger-ui-assets' {
    export const bundleJs: string
    export const css: string
    export const version: string
}
