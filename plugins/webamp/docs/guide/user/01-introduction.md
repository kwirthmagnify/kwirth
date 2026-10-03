# Introduction

Webamp is a Kwirth channel plugin that runs **Webamp** — a full Winamp 2 clone written in pure JavaScript by Jordan Eldredge — directly in your browser.

## What it does

- Plays audio files (MP3, OGG, WAV, FLAC, M4A, AAC, Opus, WebM)
- Plays radio streams from M3U playlists (80s, jazz, rock, electronic, and 90+ more genres)
- Supports classic Winamp skins (`.wsz` files)
- Drag and drop files directly onto the player
- Double-size mode enabled by default
- Winamp hotkeys enabled (Z X C V B, etc.)
- Right-click for the Winamp context menu

## How it works

The player runs inside an isolated `<iframe>` within a Kwirth tab. The Webamp library (~940 KB) is bundled inside the plugin — no internet connection is needed for the library itself. The M3U playlist is fetched from a public GitHub repository on start.

The player survives tab switches: when you switch to another Kwirth tab and come back, the music keeps playing and the player state is preserved.

## Credits

- **Webamp** by Jordan Eldredge ([github.com/captbaritone/webamp](https://github.com/captbaritone/webamp)), MIT license
- Version included: webamp@2.3.1
- Milkdrop visualizer is excluded (it uses WebAssembly; this build is pure JavaScript)
- Get skins from the [Winamp Skin Museum](https://skins.webamp.org)
- M3U playlists from [junguler/m3u-radio-music-playlists](https://github.com/junguler/m3u-radio-music-playlists)
