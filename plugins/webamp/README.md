# Webamp

A Winamp 2 music player for Kwirth, powered by Webamp (Winamp 2 in JavaScript by Jordan Eldredge).

## What it is

This is a Kwirth channel plugin that runs Webamp — a full Winamp 2 clone — directly in the browser. The player runs inside an isolated `<iframe>` within a Kwirth tab. Drag and drop audio files (MP3, OGG, WAV, FLAC, M4A...) and Winamp skins (.wsz) onto the player.

## Installation

Install via the Kwirth plugin marketplace:

1. Go to **Settings → Plugins → Marketplace**
2. Find **Webamp**
3. Click **Install**
4. Add the channel to any cluster view

## Usage

- Start the channel (tab settings ⚙ → Start)
- Drag and drop audio files onto the player area
- Drag and drop a `.wsz` skin file to change the look
- Right-click on Webamp for the options menu
- Winamp hotkeys are enabled (Z X C V B, etc.)

## Architecture

- The Webamp library (`webamp.txt`, ~940 KB) is bundled as text inside `dist/front.js`
- At runtime, the library is injected into an `<iframe>` via `srcdoc`
- The iframe isolates Webamp's globals from Kwirth's React/MUI
- The player survives tab switches (the iframe lives in `channelObject.data`, outside React's tree)
- No back storage: the player is stateless from the server's perspective

## Credits

Webamp by Jordan Eldredge ([github.com/captbaritone/webamp](https://github.com/captbaritone/webamp)), MIT license. Version included: webamp@2.3.1. Milkdrop visualizer is excluded (it uses WebAssembly; this build is pure JavaScript).

## Links

- [Kwirth](https://kwirthmagnify.dev)
- [Kwirth repository](https://github.com/aisdkvercel/kwirth)
- [Webamp](https://github.com/captbaritone/webamp)
- [Winamp Skin Museum](https://skins.webamp.org)
