# IRIA Rally-X

**IRIA Rally-X** is a Kwirth channel plugin that brings the classic 1980s arcade game *Rally-X*
to your Kwirth workspace. The game runs entirely in the browser — there is no cluster resource
involved.

The game is a homebrew recreation built with Phaser 2.x and RequireJS. It loads instantly and runs
at full speed inside an isolated `<iframe>`, so the game's globals never interfere with Kwirth's
React/MUI frontend.

## What you get

- The full Rally-X arcade experience: drive your car through a maze, collect flags, avoid rocks
  and enemy cars, drop smoke to escape
- A high-scores table persisted in the cluster (ConfigMap)
- Optional notification when the all-time record is beaten
- The game survives tab switches — switch to another Kwirth tab and back, your game is still running

## Quick start

1. Install the plugin (see [Installation](admin/01-install.md))
2. Add a Rally-X channel to any workspace
3. Click Start, then click the game area to give it keyboard focus
4. Press `Space` or `Ctrl` to start a game
5. Use `←` `↑` `→` `↓` to drive, `Ctrl` to drop smoke
