# File Manager DCE

The file browser's library, out of the core: [`@jfvilas/react-file-manager`](https://www.npmjs.com/package/@jfvilas/react-file-manager) lives in a [dynamic core extension](index) so that the installations that never open a file tree do not carry it.

| | |
|---|---|
| id | `file-manager` |
| package | `@kwirthmagnify/kwirth-dce-file-manager` |
| sides | front only |
| source | `dces/file-manager` in the kwirth repo |

It is what `fileman` draws with, and what `magnify` will draw with.

## What it provides

```ts
interface IFileManagerDce {
    readonly id: string
    /** The @jfvilas/react-file-manager module namespace. Its stylesheet is already on the page. */
    readonly fileManager: TFileManagerModule
}
```

### The module namespace, not a wrapper

What travels is the library's **namespace**, untouched. That is deliberate: a consumer keeps writing

```ts
import { FileManager } from '@jfvilas/react-file-manager'
```

exactly as it did when the core published the library as a global, and only its **build** changes — the package now resolves against the DCE's instance instead of `window.__kwirth__`. Wrapping the library would mean a second API to keep in step with it, and one more place to fall behind.

### The stylesheet comes with it

The file manager does not draw without its CSS, and the core no longer loads it. The DCE puts it on the page when it is created, once, as `<style id="kwirth-dce-file-manager-css">`.

## Consuming it

```json
"requiresExtension": ["dce:file-manager:0.1.0"]
```

And in the consumer's `build.mjs`, map the library onto the DCE's instance:

```js
build.onLoad({ filter: /.*/, namespace: 'kwirth-dce' }, () => ({
    contents: `const _e = window.__kwirth_dce__['file-manager']; module.exports = _e && _e.instance ? _e.instance.fileManager : {};`,
    loader: 'js',
}))
```

⚠️ **Never bundle the library.** A bundled copy brings its own React with it, and the component's hooks only work against the React that renders them — the failure comes out of the library, where nobody thinks to look.

## Two things to know about the library itself

Neither is Kwirth's doing, and both will bite whoever touches it next:

- 🔴 **It ships no type declarations.** No `types` field, no `.d.ts` in the tarball. Importing `IFileObject`, `IError` or `IFileManagerHandle` from it gives you `any`, and that only compiles because the consumers run with `strict: false`. The DCE publishes its own contract, but the contract names the library's module type, so it inherits the gap.
- 🔴 **Its `main` is broken as published.** It points at `src/index.js`, which imports files the tarball does not ship. Browsers never hit it, because bundlers prefer `module`; anything resolving it from node needs `mainFields: ['module', 'main']`.

## Updating it

A DCE's factory runs **once**, so a new version needs the back end **restarted** and the browser **reloaded**. Whoever already holds the instance keeps it until then.
