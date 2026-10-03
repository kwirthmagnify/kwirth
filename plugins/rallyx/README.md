# IRIA Rally-X

A Rally-X arcade game channel plugin for [Kwirth](https://kwirthmagnify.dev).

## What it is

This plugin runs a homebrew recreation of the classic 1980s Rally-X arcade game
(originally by Midway/Namco) inside a Kwirth tab. The game is built with Phaser
2.x and runs in an isolated iframe, so its globals never clash with Kwirth's
React/MUI.

The game state (score, lives, round, fuel) is displayed in a HUD bar above the
game area. High scores are persisted in a Kubernetes ConfigMap, shared across
all users of the cluster.

## How it works

- The game (Phaser + RequireJS + all assets) is bundled into the plugin's
  `front.js` as text and base64. At runtime, it is injected into an iframe via
  `srcdoc` — no network requests needed.
- The iframe survives tab switches: switching away hides it, switching back
  repositions it. Only stopping the channel destroys it.
- A `postMessage` bridge reports game state to the plugin for HUD display and
  score persistence.
- High scores are stored via the back channel's `writeStorage` (ConfigMap
  `kwirth-store-channel-rallyx-scores`).

## Installation

Install from the private Nexus (scope `@iriaoperae`):

```bash
npm install @iriaoperae/kwirth-plugin-rallyx
```

Then add the channel to your Kwirth cluster configuration.

## Controls

| Key | Action |
|-----|--------|
| ← ↑ → ↓ | Drive |
| Ctrl | Drop smoke |
| Space / Ctrl | Start (on title screen) |

## Architecture

```
src/
├── back/index.ts          — back channel: score persistence (ConfigMap)
├── common/RallyxTypes.ts  — shared types
├── front/
│   ├── index.ts           — registers RallyxChannel on window.__kwirth_plugins__
│   ├── RallyxChannel.tsx  — IChannel impl (lifecycle, message routing)
│   ├── RallyxMachine.ts   — iframe manager (builds HTML, manages lifecycle)
│   ├── RallyxTabContent.tsx — tab UI (HUD, game area, scores overlay)
│   ├── RallyxSetup.tsx    — setup dialog (sender notification, pause-on-blur)
│   ├── RallyxConfig.ts    — config classes
│   ├── RallyxData.ts      — channel state (survives tab switches)
│   ├── RallyxScores.ts    — score store (back + local fallback)
│   ├── icons.tsx          — plugin icon
│   ├── IriaPlayLogo.tsx   — brand logo
│   └── rallyx/
│       ├── phaser.txt     — Phaser 2.x library
│       ├── require.txt    — RequireJS library
│       ├── js/*.txt       — game modules (named AMD defines)
│       └── assets/        — game assets (PNGs, tilemap JSON)
└── types/assets.d.ts      — ambient declarations for non-TS imports
```

## License

The upstream game is MIT licensed (Copyright (c) 2017 Marco Parenzan).
See [NOTICE.md](NOTICE.md) for full attribution.
