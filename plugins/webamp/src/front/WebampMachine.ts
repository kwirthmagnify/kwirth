/**
 * WebampMachine — manager for the iframe that survives tab switches.
 *
 * Webamp (Winamp 2 in JavaScript by Jordan Eldredge) runs in an iframe to
 * isolate its globals from Kwirth's React/MUI. The library is a UMD bundle
 * (~940 KB) that exposes `window.Webamp`.
 *
 * The library is bundled as text in front.js and injected into the iframe as
 * an inline <script>. No network fetch is needed at runtime for the library
 * itself, but the M3U playlist IS fetched from the configured URL.
 *
 * Machine pattern that survives tab switches (same as GalagaMachine /
 * SpectrumMachine):
 * - The host <div> is position:fixed on document.body, never removed.
 * - attach(anchor) repositions the div over the anchor and shows it.
 * - detach() hides the div.
 * - only dispose() (from stopChannel) destroys the iframe.
 *
 * postMessage bridge: when the user clicks "Open songs..." or uses the
 * Webamp Options → Play menu, the iframe asks the parent to show a stream
 * picker dialog. The parent (React) shows a MUI dialog and sends the
 * selected track back.
 */

// The Webamp library (bundled as text, injected into the iframe)
import webampLibrary from './webamp/webamp.txt'
import { DEFAULT_M3U_URL } from '../common/WebampTypes'

/**
 * Builds the HTML for the iframe. The M3U URL is injected so the iframe can
 * fetch the playlist on load and use the entries as initial tracks.
 */
function buildIframeHtml(m3uUrl: string): string {
    const safeUrl = m3uUrl || DEFAULT_M3U_URL
    const appScript = `
var M3U_URL = ${JSON.stringify(safeUrl)};

function error(msg) {
  var e = document.getElementById("error");
  e.textContent = msg; e.style.display = "block";
}

/**
 * Fetch and parse an M3U playlist. Returns an array of { name, url }.
 * Lines starting with #EXTINF have the name after the first comma.
 * The next non-comment line is the URL.
 */
async function fetchM3U(url) {
  try {
    var resp = await fetch(url);
    if (!resp.ok) return [];
    var text = await resp.text();
    var lines = text.split(/\\r?\\n/);
    var streams = [];
    var pendingName = "";
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (line.startsWith("#EXTINF")) {
        var commaIdx = line.indexOf(",");
        pendingName = commaIdx >= 0 ? line.substring(commaIdx + 1).trim() : "";
      } else if (!line.startsWith("#")) {
        // Clean up HTML entities in names
        var name = pendingName || line;
        streams.push({ name: name, url: line });
        pendingName = "";
      }
    }
    return streams;
  } catch (e) {
    return [];
  }
}

if (!window.Webamp || !Webamp.browserIsSupported()) {
  error("This browser is not compatible with Webamp.");
} else {
  // Fetch the M3U playlist, then create Webamp with the parsed tracks.
  fetchM3U(M3U_URL).then(function(streams) {
    window.WEBAMP_STREAMS = streams;

    // Map streams to Webamp track objects.
    var initialTracks = streams.map(function(s) {
      return { url: s.url, defaultName: s.name };
    });

    // --- postMessage bridge for the stream picker dialog ---
    var pickResolve = null;

    window.addEventListener("message", function(e) {
      if (e.data && e.data.type === "webamp-stream-selected") {
        if (pickResolve) {
          pickResolve(e.data.tracks || []);
          pickResolve = null;
        }
      }
    });

    function openStreamPicker() {
      return new Promise(function(resolve) {
        pickResolve = resolve;
        window.parent.postMessage({
          type: "webamp-pick-stream",
          streams: window.WEBAMP_STREAMS || []
        }, "*");
      });
    }

    var webamp = new Webamp({
      enableHotkeys: true,
      initialTracks: initialTracks,
      availableSkins: [],
      enableDoubleSizeMode: true,
      filePickers: [{
        contextMenuName: "Open stream...",
        filePicker: openStreamPicker,
        requiresNetwork: true
      }]
    });
    webamp.renderWhenReady(document.body).then(function() {
      // Set initial volume to 10%.
      webamp.setVolume(10);
    });

    // --- drag and drop (local files) ---
    var esSkin = function (f) { return /\\.(wsz|zip)$/i.test(f.name); };
    var esAudio = function (f) { return /^audio\\//.test(f.type) || /\\.(mp3|ogg|oga|wav|flac|m4a|aac|opus|webm)$/i.test(f.name); };

    function cargar(files) {
      var pistas = [];
      Array.prototype.forEach.call(files, function (f) {
        if (esSkin(f)) webamp.setSkinFromUrl(URL.createObjectURL(f));
        else if (esAudio(f)) pistas.push({ blob: f, defaultName: f.name.replace(/\\.[^.]+$/, "") });
      });
      if (pistas.length) webamp.appendTracks(pistas);
    }

    var capa = document.getElementById("soltar");
    function fueraDeWebamp(e) { return !(e.target.closest && e.target.closest("#webamp")); }
    document.addEventListener("dragover", function (e) {
      if (fueraDeWebamp(e)) { e.preventDefault(); capa.classList.add("visible"); }
    });
    document.addEventListener("dragleave", function (e) {
      if (e.relatedTarget === null) capa.classList.remove("visible");
    });
    document.addEventListener("drop", function (e) {
      capa.classList.remove("visible");
      if (fueraDeWebamp(e)) { e.preventDefault(); cargar(e.dataTransfer.files); }
    });

    // --- "Open songs..." button: shows the stream picker dialog ---
    document.getElementById("abrir_button").onclick = function () {
      openStreamPicker().then(function(tracks) {
        if (tracks && tracks.length) webamp.appendTracks(tracks);
      });
    };

    // --- "Load skin..." button: native file picker for skins only ---
    var inSkin = document.getElementById("skins");
    document.getElementById("skin_button").onclick = function () { inSkin.click(); };
    inSkin.onchange = function () { cargar(inSkin.files); inSkin.value = ""; };
  });
}
`

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Webamp</title>
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; }
  body { background: #0a3a3a radial-gradient(circle at 30% 20%, #146060 0%, #0a3a3a 55%, #062424 100%);
    font-family: Tahoma, Verdana, sans-serif; font-size: 12px; color: #cfe6e6; }
  #ayuda { position: fixed; left: 16px; bottom: 16px; max-width: 330px; background: rgba(0,0,0,.45);
    border: 1px solid rgba(255,255,255,.15); padding: 10px 12px; line-height: 1.5; }
  #ayuda strong { color: #fff; }
  #ayuda button { margin-top: 6px; background: #1d1d2b; color: #cfe6e6; border: 1px solid #555; font: inherit;
    padding: 3px 8px; cursor: pointer; }
  #ayuda button:focus-visible { outline: 2px solid #7fd; }
  #soltar { position: fixed; inset: 0; display: none; align-items: center; justify-content: center;
    background: rgba(0,40,40,.7); color: #fff; font-size: 18px; pointer-events: none; }
  #soltar.visible { display: flex; }
  #error { display: none; position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
    background: #400; color: #fff; padding: 10px 14px; border: 1px solid #a33; }
</style>
</head>
<body>
<div id="ayuda">
  <strong>Drag here</strong> your songs (MP3, OGG, WAV, FLAC, M4A...) to add them to the playlist,
  or a <strong>.wsz</strong> skin to change the look.
  Use <strong>Open songs...</strong> to pick a radio stream.
  <br>
  <button id="abrir_button">Open songs...</button>
  <button id="skin_button">Load skin...</button>
  <input type="file" id="skins" accept=".wsz,.zip" hidden>
</div>
<div id="soltar">Drop to add</div>
<div id="error"></div>

<script>${webampLibrary}</script>
<script>${appScript}</script>
</body>
</html>`
}

export class WebampMachine {
    private hostDiv: HTMLDivElement | undefined
    private iframe: HTMLIFrameElement | undefined
    private resizeObserver: ResizeObserver | undefined
    private messageListener: ((e: MessageEvent) => void) | undefined

    /** Called when the iframe asks for a stream picker dialog. Set by React. */
    onPickStream: ((streams: Array<{ name: string, url: string }>) => void) | undefined

    /** Creates the host and the iframe, loads Webamp. */
    init(m3uUrl?: string): void {
        if (this.hostDiv) return

        this.hostDiv = document.createElement('div')
        // z-index 1: above normal flow, below MUI menus/popovers (z-index 1000+).
        this.hostDiv.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; z-index:1; display:none; background:#000;'
        document.body.appendChild(this.hostDiv)

        this.iframe = document.createElement('iframe')
        this.iframe.title = 'Webamp'
        this.iframe.style.cssText = 'width:100%; height:100%; border:0; display:block;'
        this.iframe.setAttribute('allow', 'autoplay')
        // srcdoc with the app HTML — Webamp runs inside the iframe.
        this.iframe.srcdoc = buildIframeHtml(m3uUrl || DEFAULT_M3U_URL)
        this.hostDiv.appendChild(this.iframe)

        // Listen for postMessage from the iframe (stream picker requests).
        this.messageListener = (e: MessageEvent) => {
            if (!this.iframe || e.source !== this.iframe.contentWindow) return
            const data = e.data
            if (data && data.type === 'webamp-pick-stream') {
                this.onPickStream?.(data.streams || [])
            }
        }
        window.addEventListener('message', this.messageListener)
    }

    /** Sends the user-selected track back to the iframe. */
    sendSelectedTrack(track: { url: string, defaultName: string }): void {
        this.iframe?.contentWindow?.postMessage({
            type: 'webamp-stream-selected',
            tracks: [track]
        }, '*')
    }

    /** Anchors the iframe to a container of the tab (shows the player). */
    attach(anchor: HTMLElement): void {
        if (!this.hostDiv || !this.iframe) return
        this.positionOver(anchor)
        this.hostDiv.style.display = 'block'

        // Reposition if the anchor changes size.
        this.resizeObserver?.disconnect()
        this.resizeObserver = new ResizeObserver(() => this.positionOver(anchor))
        this.resizeObserver.observe(anchor)
    }

    /** Detaches (hides the player when switching tabs). */
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
        if (this.messageListener) {
            window.removeEventListener('message', this.messageListener)
            this.messageListener = undefined
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

    /** Positions the host div over the anchor element. */
    private positionOver = (anchor: HTMLElement): void => {
        if (!this.hostDiv || !this.iframe) return
        const rect = anchor.getBoundingClientRect()
        this.hostDiv.style.left = `${rect.left}px`
        this.hostDiv.style.top = `${rect.top}px`
        this.hostDiv.style.width = `${rect.width}px`
        this.hostDiv.style.height = `${rect.height}px`

        // Webamp manages its own layout; just fill the iframe.
        this.iframe.style.width = '100%'
        this.iframe.style.height = '100%'
        this.iframe.style.marginLeft = '0px'
        this.iframe.style.marginTop = '0px'
    }

    get ready(): boolean { return this.hostDiv !== undefined }
}
