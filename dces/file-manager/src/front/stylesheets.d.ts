/*
    esbuild loads .css as text ('.css': 'text'): the import is the stylesheet's source.

    ⚠️ NOT named css.d.ts, although that is what the other DCEs call it. This folder also has a css.ts,
    and TypeScript treats a .d.ts sitting next to a .ts of the same base name as that file's generated
    declaration — so css.d.ts was silently ignored and the stylesheet import stopped resolving.
*/
declare module '*.css' {
    const css: string
    export default css
}
