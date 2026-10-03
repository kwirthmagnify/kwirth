# Troubleshooting

## The game area is black

- **Did you click Start?** The game only appears after starting the channel.
- **Did you click the game area?** The iframe needs keyboard focus. Click anywhere in the black
  area to give it focus.
- **Check the browser console** — if Phaser failed to boot, there will be an error.

## Keyboard doesn't respond

The iframe needs focus to receive keyboard events. **Click the game area** first. If you clicked
elsewhere (e.g., a menu) the iframe lost focus — click the game again.

## The gear menu is behind the game

This should not happen — the game's z-index is set to stay below MUI menus. If you see this,
report it as a bug.

## Game disappears when switching tabs

This is expected — the game is hidden when you switch tabs, but it **keeps running**. Switch back
to the Rally-X tab and the game reappears exactly where you left it.

## Scores not saving

- Check that the WebSocket is connected (look for errors in the notification area)
- The score only saves if it qualifies for the top 10
- The save button only appears when the game is over and the score qualifies
