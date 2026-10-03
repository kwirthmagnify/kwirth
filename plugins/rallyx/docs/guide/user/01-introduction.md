# What it is

IRIA Rally-X is a **channel plugin** for Kwirth that serves a homebrew recreation of the classic
1980s arcade game *Rally-X* (originally by Midway/Namco), developed by Marco Parenzan.

## Why

Kwirth channels are not just for monitoring and alerts — they can serve interactive content.
Rally-X demonstrates that a full Phaser 2.x game, with sprites, tilemaps and audio, can run inside
a Kwirth tab alongside the rest of the platform, with zero impact on the host application.

## How it is packaged

- The game's JavaScript modules (Phaser 2.x, RequireJS, and the game code) are **bundled inside
  `dist/front.js`** as text — no external fetch, no CDN dependency.
- All image and tilemap assets are bundled as **base64 data URIs**.
- At runtime, everything is injected into an `<iframe>` via `srcdoc`, fully isolated from Kwirth's
  DOM.
- A Phaser loader patch redirects the game's `"assets/..."` URLs to the data URIs, so the game code
  itself is unmodified in its asset loading calls.

## Controls

| Key | Action |
|-----|--------|
| `←` `↑` `→` `↓` | Drive |
| `Ctrl` | Drop smoke |
| `Space` / `Ctrl` | Start (on title screen) |

Click the game area first to give the iframe keyboard focus.
