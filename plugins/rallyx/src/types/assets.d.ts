/**
 * Ambient declarations for non-TS asset imports.
 *
 * esbuild loaders (configured in build.mjs / watch.mjs):
 *   .txt  -> text   (game JS code, Phaser library, RequireJS — injected into the iframe)
 *   .png  -> base64 (image assets — data URIs in the iframe)
 *   .json -> base64 (tilemap data — data URI in the iframe)
 */
declare module '*.txt' {
    const content: string
    export default content
}

declare module '*.png' {
    const content: string
    export default content
}

declare module '*.json' {
    const content: string
    export default content
}
