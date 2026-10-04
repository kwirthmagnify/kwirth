# Three.js

A **dynamic core extension** (DCE) for [Kwirth](https://kwirthmagnify.dev) that shares the [three.js](https://threejs.org/) 3D library across extensions.

A DCE brings **objects**, not data and not screens: Kwirth calls its factory **once**, keeps what it returns, and any other extension can ask for it by id. This DCE bundles `three` into its `front.js` and exposes the `THREE` namespace, so every consumer uses the same single copy instead of each bundling its own (~580 KB each).

## Consuming it

Declare the dependency in the consumer's `package.json`:

```json
"requiresExtension": ["dce:three:0.1.0"]
```

In the front end:

```ts
import { getDce } from '@kwirthmagnify/kwirth-common-front'
import type { IThree } from '@kwirthmagnify/kwirth-dce-three/src/common'

const { THREE } = getDce<IThree>('three')

// then use THREE as normal:
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1000)
```

The DCE is loaded **before** any plugin, so `getDce('three')` is safe to call at module level.

## Building

```
npm install
npm run build      # typecheck + dist
npm run watch      # rebuild on every save
npm test
```

Install it from **☰ → Manage extensions → DCE** in Kwirth. Updating a DCE needs the Kwirth back end **restarted**.

Part of [Kwirth](https://github.com/kwirthmagnify/kwirth).
