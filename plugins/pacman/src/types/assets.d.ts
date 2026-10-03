/**
 * Ambient declarations for non-TS asset imports.
 *
 * esbuild loaders (configured in build.mjs / watch.mjs):
 *   .txt -> text (the game JavaScript, injected into the iframe)
 */
declare module '*.txt' {
    const content: string
    export default content
}
