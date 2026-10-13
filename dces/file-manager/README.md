# File Manager

A **dynamic core extension** (DCE) for [Kwirth](https://kwirthmagnify.dev): the shared
[`@jfvilas/react-file-manager`](https://www.npmjs.com/package/@jfvilas/react-file-manager), so the
extensions that draw a file tree get it from here instead of the core carrying it for everyone.

A DCE brings **objects**, not data and not screens: Kwirth calls its factory **once**, keeps what it
returns, and any other extension can ask for it by id. This one is **front only** — a file browser has
no business in the back end.

## What it gives you

```ts
interface IFileManagerDce {
    readonly id: string
    /** The @jfvilas/react-file-manager module namespace. Its stylesheet is already on the page. */
    readonly fileManager: TFileManagerModule
}
```

It hands out the **module namespace**, untouched — not a wrapper. That is what lets a consumer keep
writing its imports exactly as it did when the core published the library as a global:

```ts
import { FileManager } from '@jfvilas/react-file-manager'   // unchanged
```

…and only change where its build resolves that package. A wrapper would be a second API to keep in
step with the library, and one more place to fall behind it.

**The stylesheet comes with it.** The file manager does not draw without its CSS, and the core no
longer loads it: this DCE puts it on the page when it is created, once.

## Consuming it

Declare the dependency in the consumer's `package.json`:

```json
"requiresExtension": ["dce:file-manager:0.1.0"]
```

Kwirth then refuses to install the consumer without this DCE, and refuses to remove this DCE while the
consumer is installed.

Then map the library onto the DCE's instance in the consumer's `build.mjs`, so it resolves against the
registry instead of being bundled:

```js
build.onLoad({ filter: /.*/, namespace: 'kwirth-dce' }, () => ({
    contents: `const _e = window.__kwirth_dce__['file-manager']; module.exports = _e && _e.instance ? _e.instance.fileManager : {};`,
    loader: 'js',
}))
```

⚠️ **Do not bundle the library.** A bundled copy is a second one on the page, and it would carry its
own React — at which point the component's hooks stop working, from inside a library nobody would
think to suspect.

### About its types

🔴 `@jfvilas/react-file-manager` **ships no type declarations**: its `package.json` has no `types`
field and the tarball has no `.d.ts`. Consumers import `IFileObject` and friends from it and get
`any` — which works today only because they run with `strict: false`. This DCE publishes its own
contract (`index.d.ts`), but the contract names the library's module type, so it inherits that
limitation. Declaring the library's real surface belongs upstream, in the library.

🔴 And its **`main` is broken as published**: it points at `src/index.js`, which imports files the
tarball does not ship. Browsers never hit it, because bundlers prefer `module`; anything resolving it
from node needs `mainFields: ['module', 'main']`.

## Building

```
npm install
npm run build      # typecheck + dist
npm run watch      # rebuild on every save
npm test
```

⚠️ The harness covers **only** the stylesheet injection. The library touches `document` while it is
being imported, so node cannot load it at all — everything else is covered by the core's e2e
(`front/e2e/tests/dce-file-manager.spec.ts`), which runs in a real browser.

Install it from **☰ → Manage extensions → DCEs** in Kwirth. Updating a DCE needs the Kwirth back end
**restarted** and the browser **reloaded**: the factory runs once, and its instance lives in the page.

Part of [Kwirth](https://github.com/kwirthmagnify/kwirth).
