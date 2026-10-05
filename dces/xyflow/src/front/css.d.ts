// esbuild loads .css as text ('.css': 'text'): the import is the stylesheet's source.
declare module '*.css' {
    const css: string
    export default css
}
