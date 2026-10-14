import customCss from './custom-fm-magnify.css'
import resizableDialogCss from './components/ResizableDialog.css'
import { MagnifyChannel } from './MagnifyChannel'

/*
    Magnify's OWN stylesheets, put on the page once, when the plugin loads. In the core webpack injected
    them from each component's import; a plugin is one script, so they travel inside it as text.

    The file manager library's stylesheet is not here: the `file-manager` DCE puts it on the page when the
    core creates it, once for every consumer.
*/
for (const [id, css] of [['kwirth-plugin-magnify-css', customCss], ['kwirth-plugin-magnify-resizable-css', resizableDialogCss]]) {
    if (document.getElementById(id)) continue
    const style = document.createElement('style')
    style.id = id
    style.textContent = css
    document.head.appendChild(style)
}

declare global {
    interface Window { __kwirth_plugins__: Record<string, unknown> }
}

if (!window.__kwirth_plugins__) window.__kwirth_plugins__ = {}
window.__kwirth_plugins__['magnify'] = MagnifyChannel
