# NOTICE — Rally-X Plugin

## Upstream Game

The Rally-X game is a homebrew recreation of the classic 1980s arcade game
Rally-X (originally by Midway/Namco), developed by Marco Parenzan.

- **Source:** https://github.com/marcoparenzan/rallyx
- **License:** MIT (see below)
- **Technology:** Phaser 2.x (HTML5 game framework) + RequireJS (AMD module loader)

### Modifications

The game code has been adapted to run inside a Kwirth plugin iframe:

1. **Named AMD defines:** The original modules use anonymous `define([])` calls
   that rely on the script URL for the module name. In the iframe (inline
   scripts), there is no URL, so each module has been given an explicit name:
   `define("car", [])`, `define("flag", [])`, etc.

2. **Cookie → localStorage:** The original high-score persistence uses browser
   cookies. In the iframe `srcdoc` context, cookies are unreliable, so the
   `setCookie`/`getCookie`/`deleteCookie` functions have been replaced with
   `localStorage` equivalents.

3. **postMessage bridge:** A bridge has been added to report game state (score,
   lives, round, fuel) and game-over events to the parent window (the Kwirth
   plugin), so the plugin can display HUD values and persist scores in the
   cluster's ConfigMap.

4. **Asset loading:** Assets are inlined as data URIs. A Phaser loader patch
   redirects the game's `"assets/..."` URLs to these data URIs, so the game
   code itself is unmodified in its asset loading calls.

### Files vendored from upstream

- `src/front/rallyx/phaser.txt` — Phaser 2.x library (unmodified)
- `src/front/rallyx/require.txt` — RequireJS library (unmodified)
- `src/front/rallyx/js/*.txt` — Game modules (modified as described above)
- `src/front/rallyx/assets/*` — Game assets (unmodified)

## Phaser

- **Source:** https://phaser.io/
- **License:** MIT

## RequireJS

- **Source:** https://requirejs.org/
- **License:** MIT

## License (upstream game)

The MIT License (MIT)

Copyright (c) 2017 Marco Parenzan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
