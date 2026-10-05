# XYFlow

A **dynamic core extension** (DCE) for [Kwirth](https://kwirthmagnify.dev) that shares two graph libraries across extensions:

- [React Flow](https://reactflow.dev/) (`@xyflow/react`): renders node-and-edge diagrams and lets users edit them.
- [ELK](https://eclipse.dev/elk/) (`elkjs`, the Eclipse Layout Kernel): works out where every node goes.

A DCE brings **objects**, not data and not screens. Kwirth calls its factory **once** and keeps what it returns, and any other extension can ask for it by id. This DCE bundles both libraries into its `front.js`, so every consumer uses one shared copy. Before it, the Kwirth core itself carried both libraries on every page.

React is **not** bundled. React Flow runs against Kwirth's own React and ReactDOM (`window.__kwirth__`), because its hooks only work with the React that renders them. React Flow's stylesheet is also put on the page by the DCE when it is created, so consumers don't need to import any CSS.

## Consuming it

Declare the dependency in the consumer's `package.json`:

```json
"requiresExtension": [{ "extensionType": "dce", "id": "xyflow", "minVersion": "0.1.0" }]
```

**React Flow**: map the package against the DCE's instance in the consumer's `build.mjs` / `watch.mjs` globals. The consumer's code then keeps importing `@xyflow/react` as normal, and the bundle carries none of it:

```js
'@xyflow/react': "window.__kwirth_dce__['xyflow'].instance.reactFlow",
```

**ELK**: ask the DCE for the constructor. The types come with the published package. Add `@kwirthmagnify/kwirth-dce-xyflow` as a devDependency from npm (never as a `file:` link):

```ts
import { getDce } from '@kwirthmagnify/kwirth-common-front'
import type { IXyflow } from '@kwirthmagnify/kwirth-dce-xyflow'

const ELK = await getDce<IXyflow>('xyflow').loadElk()
const layout = await new ELK().layout({ id: 'root', children: [...], edges: [...] })
```

`loadElk()` is async on purpose. elk is the heavy half of the DCE (~1.4 MB), and keeping the call a promise lets it become lazy again without consumers changing.

The DCE is loaded **before** any plugin, so reading it at module level is safe.

## Building

```
npm install
npm run build      # typecheck + dist
npm run watch      # rebuild on every save
npm test
```

Install it from **☰ → Manage extensions → DCE** in Kwirth. Updating a DCE needs the Kwirth back end **restarted**.

Part of [Kwirth](https://github.com/kwirthmagnify/kwirth).
