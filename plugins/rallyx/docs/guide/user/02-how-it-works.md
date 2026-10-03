# How it works

## Architecture

Rally-X is an **autonomous channel**: `cluster: false`, `routable: false`, no endpoints. The game
runs entirely in the browser — the backend only stores and serves the high-scores table.

### Front

1. **RallyxMachine** creates a `position:fixed` `<div>` on `document.body` containing an `<iframe>`.
2. The iframe's `srcdoc` contains RequireJS, Phaser 2.x, a loader patch, all game modules (as named
   AMD defines), and the game entry point — all inline.
3. Assets (sprites, tilemaps) are inlined as base64 data URIs. A Phaser loader patch redirects
   `"assets/..."` URLs to these data URIs.
4. The canvas scales to fill the iframe (`width:100%; height:100%`), maintaining the 4:3 aspect
   ratio (1280×960). A `ResizeObserver` repositions the iframe when the window resizes.
5. The machine lives in `channelObject.data`, **outside the React tree**. When you switch Kwirth
   tabs, the tab content unmounts but the machine survives — `detach()` just hides the div, and
   `attach()` repositions it when you come back.
6. A `postMessage` bridge reports game state (score, lives, round, fuel) and game-over events from
   the iframe to the plugin, for HUD display and score persistence.

### Back

The backend is a simple `IChannel` that:
- Stores high scores in a ConfigMap via `writeStorage` / `readStorage` (key: `rallyx-scores`)
- Handles `MSG_SCORES_GET` and `MSG_SCORE_SUBMIT` commands
- Sanitizes, sorts and trims the table to 10 entries
- Optionally notifies via a sender when the #1 record is beaten

### Why an iframe?

The game uses globals (`Phaser`, `requirejs`, `define`) that would clash with Kwirth's React/MUI
environment. The iframe provides complete isolation — the game has its own `document`, `window`
and global scope.

### Modifications to the upstream game

1. **Named AMD defines** — the original modules use anonymous `define([])` that rely on the script
   URL. In the iframe (inline scripts), there is no URL, so each module is given an explicit name.
2. **Cookie → localStorage** — the original high-score persistence uses cookies. In the iframe
   `srcdoc` context, cookies are unreliable, so they are replaced with `localStorage`.
3. **postMessage bridge** — added to report game state and game-over to the parent window.
4. **Asset loading** — assets are inlined as data URIs; a Phaser loader patch redirects URLs.
