// What the build inlines (build.mjs loaders): a stylesheet as its text.
declare module '*.css' {
    const text: string
    export default text
}
