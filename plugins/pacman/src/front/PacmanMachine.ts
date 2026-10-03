/**
 * PacmanMachine — gestor del iframe que sobrevive tab switches.
 *
 * El juego Pac-Man es un IIFE de JavaScript (Shaun Williams, GPL v3) que corre
 * en un iframe para aislar su codigo del React/MUI de Kwirth. Usa dos canvas:
 * `canvas` (visible) y `atlas` (hidden, sprite atlas generado proceduralmente).
 *
 * El JS se bundlea como texto en front.js (importado como .txt) y se inyecta
 * en el HTML del iframe via srcdoc.
 *
 * Patron de machine que sobrevive tab switches (como GalagaMachine):
 * - El host <div> es position:fixed en document.body, nunca se quita.
 * - attach(anchor) reposiciona el div sobre el anchor y lo muestra.
 * - detach() oculta el div.
 * - solo dispose() (desde stopChannel) destruye el iframe.
 */

// The game JavaScript (bundled as text, inlined into the iframe via srcdoc)
import pacmanGame from './pacman-game.txt'

/**
 * Construye el HTML del iframe. El juego escucha window.load y se inicializa
 * solo: initRenderer(), atlas.create(), switchState(homeState), executive.init().
 */
function buildIframeHtml(gameJs: string): string {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <style>
        html, body { margin: 0; padding: 0; background: #000; overflow: hidden; }
        canvas { display: block; image-rendering: pixelated; }
        #atlas { display: none; }
    </style>
</head>
<body>
    <canvas id='canvas'></canvas>
    <canvas id='atlas'></canvas>
    <script>${gameJs}</script>
</body>
</html>`
}

export class PacmanMachine {
    private hostDiv: HTMLDivElement | undefined
    private iframe: HTMLIFrameElement | undefined
    private resizeObserver: ResizeObserver | undefined

    /** Crea el host y el iframe, carga el juego. */
    init(): void {
        if (this.hostDiv) return

        this.hostDiv = document.createElement('div')
        // z-index 1: above normal flow, below MUI menus/popovers (z-index 1000+).
        this.hostDiv.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; z-index:1; display:none; background:#000;'
        document.body.appendChild(this.hostDiv)

        this.iframe = document.createElement('iframe')
        this.iframe.title = 'Pac-Man'
        this.iframe.style.cssText = 'width:100%; height:100%; border:0; display:block;'
        this.iframe.setAttribute('allow', 'autoplay')
        // srcdoc with the game HTML — the game runs inside the iframe.
        this.iframe.srcdoc = buildIframeHtml(pacmanGame)
        this.hostDiv.appendChild(this.iframe)
    }

    /** Ancla el iframe a un contenedor del tab (muestra el juego). */
    attach(anchor: HTMLElement): void {
        if (!this.hostDiv || !this.iframe) return
        this.positionOver(anchor)
        this.hostDiv.style.display = 'block'

        // Reposicionar si el anchor cambia de tamano.
        this.resizeObserver?.disconnect()
        this.resizeObserver = new ResizeObserver(() => this.positionOver(anchor))
        this.resizeObserver.observe(anchor)
    }

    /** Desancla (oculta el juego al cambiar de pestana). */
    detach(): void {
        if (!this.hostDiv) return
        this.hostDiv.style.display = 'none'
        this.resizeObserver?.disconnect()
        this.resizeObserver = undefined
    }

    /** Destruye el iframe y limpia. */
    dispose(): void {
        this.resizeObserver?.disconnect()
        this.resizeObserver = undefined
        if (this.iframe) {
            this.iframe.remove()
            this.iframe = undefined
        }
        if (this.hostDiv) {
            this.hostDiv.remove()
            this.hostDiv = undefined
        }
    }

    /** Posiciona el host div sobre el anchor element. */
    private positionOver = (anchor: HTMLElement): void => {
        if (!this.hostDiv || !this.iframe) return
        const rect = anchor.getBoundingClientRect()
        this.hostDiv.style.left = `${rect.left}px`
        this.hostDiv.style.top = `${rect.top}px`
        this.hostDiv.style.width = `${rect.width}px`
        this.hostDiv.style.height = `${rect.height}px`

        // Scale the canvas to fit the iframe while keeping aspect ratio (224x288 = 7:9)
        const targetW = rect.width
        const targetH = rect.height
        const aspect = 224 / 288
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
