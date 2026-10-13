/*
    `@jfvilas/react-file-manager` ships NO type declarations.

    Its package.json points `main` at `src/index.js` and carries neither a `types` field nor a single
    `.d.ts`, so TypeScript resolves it to plain JavaScript. `plugins/fileman` gets away with importing
    `IFileObject` and friends from it because its tsconfig runs with `strict: false`, which turns the
    implicit `any` into a non-error — it is already working untyped there, nobody had noticed.

    This DCE is NOT going to turn strict off to paper over it: the rest of its code is typed and should
    stay that way. The module is declared here instead, where the reason is written down, and the
    import becomes `any` deliberately rather than by accident.

    ⚠️ This also bounds what the published `index.d.ts` is worth: a consumer that depends on it gets the
    same `any` the core gave it. Declaring the library's real surface — the component, `IFileObject`,
    `IError`, `IFileManagerHandle` — is in the plan's backlog, and it belongs upstream in the library
    rather than here.
*/
declare module '@jfvilas/react-file-manager'
