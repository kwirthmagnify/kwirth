/**
 * RallyxMachine — manager for the iframe that survives tab switches.
 *
 * The Rally-X game is a Phaser 2.x + RequireJS application. It runs in an
 * isolated iframe to keep its globals (Phaser, requirejs, define, game) away
 * from Kwirth's React/MUI.
 *
 * Everything is inlined into the iframe via srcdoc:
 *   - Phaser and RequireJS libraries (bundled as text)
 *   - Game modules with named AMD defines (bundled as text)
 *   - Image and tilemap assets as data URIs (bundled as base64)
 *
 * A Phaser loader patch redirects asset URLs to the data URIs so the game
 * code stays unmodified (it loads from "assets/..." paths).
 *
 * Machine pattern that survives tab switches (like GalagaMachine):
 *   - The host <div> is position:fixed on document.body, never removed.
 *   - attach(anchor) repositions the div over the anchor and shows it.
 *   - detach() hides the div.
 *   - only dispose() (from stopChannel) destroys the iframe.
 */

// Libraries (text)
import phaserLib from './rallyx/phaser.txt'
import requireLib from './rallyx/require.txt'

// Game modules with named AMD defines (text)
import carModule from './rallyx/js/car.txt'
import flagModule from './rallyx/js/flag.txt'
import gameoverModule from './rallyx/js/gameover.txt'
import hudModule from './rallyx/js/hud.txt'
import rockModule from './rallyx/js/rock.txt'
import smokeModule from './rallyx/js/smoke.txt'
import soloModule from './rallyx/js/solo.txt'
import gameModule from './rallyx/js/game.txt'

// Assets (base64 — esbuild loader)
import carPng from './rallyx/assets/car-spritesheet.png'
import flagPng from './rallyx/assets/flag-spritesheet.png'
import gameoverPng from './rallyx/assets/gameover-spritesheet.png'
import hudPng from './rallyx/assets/hud.png'
import tilesetPng from './rallyx/assets/rallyx-map-tileset.png'
import mapJson from './rallyx/assets/rallyx-map.json'
import rockPng from './rallyx/assets/rock-spritesheet.png'
import smokePng from './rallyx/assets/smoke-spritesheet.png'
import titlePng from './rallyx/assets/title.png'

/** Game native resolution (4:3 including HUD strip on the right). */
const GAME_W = 1280
const GAME_H = 960

/**
 * Builds the ASSETS map: game asset paths → data URIs.
 * The Phaser loader patch redirects "assets/..." URLs to these data URIs.
 */
function buildAssetsMap(): string {
    const assets: Record<string, string> = {
        'assets/title.png': `data:image/png;base64,${titlePng}`,
        'assets/rallyx-map.json': `data:application/json;base64,${mapJson}`,
        'assets/rallyx-map-tileset.png': `data:image/png;base64,${tilesetPng}`,
        'assets/hud.png': `data:image/png;base64,${hudPng}`,
        'assets/car-spritesheet.png': `data:image/png;base64,${carPng}`,
        'assets/flag-spritesheet.png': `data:image/png;base64,${flagPng}`,
        'assets/rock-spritesheet.png': `data:image/png;base64,${rockPng}`,
        'assets/smoke-spritesheet.png': `data:image/png;base64,${smokePng}`,
        'assets/gameover-spritesheet.png': `data:image/png;base64,${gameoverPng}`,
    }
    return JSON.stringify(assets)
}

/**
 * Builds the Phaser loader patch. Redirects asset URLs to data URIs from the
 * ASSETS map, so the game code can keep loading from "assets/..." paths.
 */
function buildLoaderPatch(): string {
    return `
var ASSETS = ${buildAssetsMap()};
(function() {
    var origImage = Phaser.Loader.prototype.image;
    Phaser.Loader.prototype.image = function(key, url, overwrite) {
        if (ASSETS[url]) url = ASSETS[url];
        return origImage.call(this, key, url, overwrite);
    };
    var origSpritesheet = Phaser.Loader.prototype.spritesheet;
    Phaser.Loader.prototype.spritesheet = function(key, url, frameWidth, frameHeight, frameMax, margin, spacing) {
        if (ASSETS[url]) url = ASSETS[url];
        return origSpritesheet.call(this, key, url, frameWidth, frameHeight, frameMax, margin, spacing);
    };
    var origTilemap = Phaser.Loader.prototype.tilemap;
    Phaser.Loader.prototype.tilemap = function(key, url, data, format) {
        if (ASSETS[url]) url = ASSETS[url];
        return origTilemap.call(this, key, url, data, format);
    };
    var origAudio = Phaser.Loader.prototype.audio;
    if (origAudio) {
        Phaser.Loader.prototype.audio = function(key, url, autoDecode) {
            if (ASSETS[url]) url = ASSETS[url];
            return origAudio.call(this, key, url, autoDecode);
        };
    }
})();
`
}

/**
 * Escapes `</script>` so it does not prematurely close the <script> tag inside the iframe.
 * `\/` is the same as `/` in a JS string literal, but the HTML parser will not see it as a
 * closing tag. This is the standard inline-script escaping technique.
 */
function safeForScript(raw: string): string {
    return raw.replace(/<\/script>/gi, '<\\/script>')
}

/**
 * Builds the full HTML document for the iframe's srcdoc.
 */
function buildIframeHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <style>
        html, body { margin: 0; padding: 0; background: #000; overflow: hidden; }
        #Rally-X { width: 100%; height: 100%; }
        canvas { width: 100% !important; height: 100% !important; display: block; image-rendering: pixelated; }
    </style>
    <script>${safeForScript(requireLib)}</script>
    <script>${safeForScript(phaserLib)}</script>
    <script>${buildLoaderPatch()}</script>
    <script>${safeForScript(carModule)}</script>
    <script>${safeForScript(flagModule)}</script>
    <script>${safeForScript(gameoverModule)}</script>
    <script>${safeForScript(hudModule)}</script>
    <script>${safeForScript(rockModule)}</script>
    <script>${safeForScript(smokeModule)}</script>
    <script>${safeForScript(soloModule)}</script>
    <script>${safeForScript(gameModule)}</script>
</head>
<body>
    <div id="Rally-X"></div>
</body>
</html>`
}

/** State payload reported by the game via postMessage. */
export interface IRallyxGameState {
    state: string
    score?: number
    lives?: number
    fuel?: number
    round?: number
    highScore?: number
}

/** Callback types for the machine. */
export type TOnState = (state: IRallyxGameState) => void
export type TOnGameOver = (score: number, round: number) => void

export class RallyxMachine {
    private hostDiv: HTMLDivElement | undefined
    private iframe: HTMLIFrameElement | undefined
    private resizeObserver: ResizeObserver | undefined
    private messageHandler: ((ev: MessageEvent) => void) | undefined

    /** Called when the game reports its state (score, lives, etc.). */
    onState?: TOnState
    /** Called when the game reports a game-over. */
    onGameOver?: TOnGameOver

    /** Creates the host and the iframe, loads the game. */
    init(): void {
        if (this.hostDiv) return

        this.hostDiv = document.createElement('div')
        // z-index 1: above normal flow, below MUI menus/popovers (z-index 1000+).
        this.hostDiv.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; z-index:1; display:none; background:#000;'
        document.body.appendChild(this.hostDiv)

        this.iframe = document.createElement('iframe')
        this.iframe.title = 'Rally-X'
        this.iframe.style.cssText = 'width:100%; height:100%; border:0; display:block;'
        this.iframe.setAttribute('allow', 'autoplay')
        // srcdoc with the game HTML — Phaser and all game code run inside the iframe.
        this.iframe.srcdoc = buildIframeHtml()
        this.hostDiv.appendChild(this.iframe)

        // Listen for postMessage from the iframe (game state + game over).
        this.messageHandler = (ev: MessageEvent) => {
            if (ev.source !== this.iframe?.contentWindow) return
            const msg = ev.data
            if (!msg || typeof msg !== 'object') return
            if (msg.type === 'rallyx-state' && this.onState) {
                this.onState(msg as IRallyxGameState)
            }
            else if (msg.type === 'rallyx-gameover' && this.onGameOver) {
                this.onGameOver(msg.score || 0, msg.round || 1)
            }
        }
        window.addEventListener('message', this.messageHandler)
    }

    /** Anchors the iframe to a container in the tab (shows the game). */
    attach(anchor: HTMLElement): void {
        if (!this.hostDiv || !this.iframe) return
        this.positionOver(anchor)
        this.hostDiv.style.display = 'block'

        // Reposition if the anchor changes size.
        this.resizeObserver?.disconnect()
        this.resizeObserver = new ResizeObserver(() => this.positionOver(anchor))
        this.resizeObserver.observe(anchor)
    }

    /** Detaches (hides the game when switching tabs). */
    detach(): void {
        if (!this.hostDiv) return
        this.hostDiv.style.display = 'none'
        this.resizeObserver?.disconnect()
        this.resizeObserver = undefined
    }

    /** Destroys the iframe and cleans up. */
    dispose(): void {
        this.resizeObserver?.disconnect()
        this.resizeObserver = undefined
        if (this.messageHandler) {
            window.removeEventListener('message', this.messageHandler)
            this.messageHandler = undefined
        }
        if (this.iframe) {
            this.iframe.remove()
            this.iframe = undefined
        }
        if (this.hostDiv) {
            this.hostDiv.remove()
            this.hostDiv = undefined
        }
    }

    /** Positions the host div over the anchor element, maintaining 4:3 aspect ratio. */
    private positionOver = (anchor: HTMLElement): void => {
        if (!this.hostDiv || !this.iframe) return
        const rect = anchor.getBoundingClientRect()
        this.hostDiv.style.left = `${rect.left}px`
        this.hostDiv.style.top = `${rect.top}px`
        this.hostDiv.style.width = `${rect.width}px`
        this.hostDiv.style.height = `${rect.height}px`

        // Scale the iframe to fit the anchor while keeping 4:3 aspect ratio.
        const targetW = rect.width
        const targetH = rect.height
        const aspect = GAME_W / GAME_H
        let w = targetW
        let h = w / aspect
        if (h > targetH) {
            h = targetH
            w = h * aspect
        }
        this.iframe.style.width = `${w}px`
        this.iframe.style.height = `${h}px`
        this.iframe.style.marginLeft = `${(targetW - w) / 2}px`
        this.iframe.style.marginTop = `${(targetH - h) / 2}px`
    }

    get ready(): boolean { return this.hostDiv !== undefined }
}
