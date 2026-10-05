# XYFlow DCE

A **library** [dynamic core extension](index): it shares two graph libraries with every extension that draws diagrams.

- [React Flow](https://reactflow.dev/) (`@xyflow/react`) renders node-and-edge diagrams and lets users edit them.
- [ELK](https://eclipse.dev/elk/) (`elkjs`, the Eclipse Layout Kernel) works out where every node goes.

| | |
|---|---|
| id | `xyflow` |
| package | `@kwirthmagnify/kwirth-dce-xyflow` |
| sides | front only |
| source | `dces/xyflow` in the kwirth repo |

The kwirth core does **not** carry these libraries. A kwirth that draws no diagrams never loads them. One that does loads them **once**, through this DCE, however many extensions draw diagrams. Today two do: the [Kwirth Status](/0.6.31/channels/status) graph and the Iter map.

## What it provides

```ts
interface IXyflow {
    readonly id: string
    readonly reactFlow: typeof import('@xyflow/react')
    loadElk(): Promise<typeof import('elkjs/lib/elk.bundled.js').default>
}
```

- **`reactFlow`** is the whole React Flow namespace: `ReactFlow`, `Background`, `Controls`, `Handle`, the hooks, the enums.
- **`loadElk()`** returns elk's constructor; `new ELK()` gives the layout engine. It is a promise on purpose. elk is the heavy half of the DCE (~1.4 MB), and keeping the call async lets it become lazy again without any consumer changing.

### It shares kwirth's React

React and ReactDOM are **not** inside the DCE. React Flow is built against the React and ReactDOM kwirth already runs, because its hooks only work with the React that renders them. A second copy would break them in ways that do not look like a React problem.

For the same reason the kwirth core publishes `ReactDOM` next to `React` in `window.__kwirth__`, so that React Flow's portals render through the same react-dom.

### It brings its stylesheet

React Flow does not draw without its CSS. The DCE puts the stylesheet on the page when it is created, once, as `<style id="kwirth-dce-xyflow-css">`. Consumers import no CSS.

## Consuming it

```json
"requiresExtension": [{ "extensionType": "dce", "id": "xyflow", "minVersion": "0.1.0" }]
```

**React Flow**: map the package against the DCE's instance in the consumer's `build.mjs` and `watch.mjs` globals. The code keeps importing `@xyflow/react` as usual, and the bundle carries none of it.

```js
'@xyflow/react': "window.__kwirth_dce__['xyflow'].instance.reactFlow",
```

**ELK**: ask the DCE for the constructor.

```ts
import { getDce } from '@kwirthmagnify/kwirth-common-front'
import type { IXyflow } from '@kwirthmagnify/kwirth-dce-xyflow'

const ELK = await getDce<IXyflow>('xyflow').loadElk()
const layout = await new ELK().layout({ id: 'root', children: [...], edges: [...] })
```

The contract's types **travel with the published package** (`index.d.ts`). The consumer adds `@kwirthmagnify/kwirth-dce-xyflow` as a devDependency from npm, never as a `file:` link. Kwirth loads every DCE before any plugin, so reading it at module level is safe.

## Weight

`front.js` is about 1.7 MB (510 KB compressed), and almost all of it is elk. React Flow and its stylesheet weigh around 200 KB. The core lost that same amount from the bundle every page downloads.
