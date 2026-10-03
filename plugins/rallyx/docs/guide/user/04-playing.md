# Playing

## Starting a game

1. Click **Start** in the tab's gear menu (⚙)
2. If the setup dialog appears, click **OK**
3. **Click the game area** — this gives the iframe keyboard focus
4. Press `Space` or `Ctrl` to start a game

## Controls

| Key | Action |
|-----|--------|
| `←` `↑` `→` `↓` | Drive |
| `Ctrl` | Drop smoke |
| `Space` / `Ctrl` | Start (on title screen) |

The key help is shown in a line below the game area.

## Objective

Drive your blue car through the maze and collect all the flags in each round. Avoid:

- **Rocks** — hitting a rock costs a life
- **Red cars** — the enemy cars chase you. Hit them and you lose a life
- **Running out of fuel** — keep an eye on the fuel gauge

Drop smoke (`Ctrl`) to temporarily blind the enemy cars and escape.

## HUD

While the game is running, a bar at the top shows:

- **Score** — current score
- **Lives** — remaining lives
- **Round** — current round (level)
- **Fuel** — remaining fuel
- **Best** — best score this session

The HUD updates in real-time via a `postMessage` bridge from the game iframe.

## Tab switches

The game survives tab switches. If you switch to another Kwirth tab and come back, your game is
exactly where you left it — the game keeps running in the background.

## Pausing

If **Pause when the tab loses focus** is enabled (default), the game pauses when the tab loses
focus. Use ⚙ → **Continue** to resume.
