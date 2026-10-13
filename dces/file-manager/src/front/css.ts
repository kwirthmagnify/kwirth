/*
    Putting the library's stylesheet on the page.

    It lives apart from index.ts for one reason: index.ts imports the file manager, and the file manager
    touches `document` while it is being imported, so nothing that pulls it in can be loaded outside a
    browser. This file pulls in nothing, so the one piece of logic the DCE actually owns — doing it
    ONCE — is exercised by the harness instead of being taken on trust.
*/

/** The id the injected <style> carries, so a second call can see it is already there. */
export const STYLE_ID = 'kwirth-dce-file-manager-css'

/**
 * Adds the stylesheet to the document, once.
 *
 * The factory runs once per page, so in principle this cannot be called twice — but a DCE's front.js
 * is re-fetched and re-evaluated whenever the core reloads it, and stacking a 100 KB stylesheet on
 * every reload is the kind of leak nobody goes looking for.
 */
export const injectCss = (doc: Document, css: string): void => {
    if (doc.getElementById(STYLE_ID)) return
    const style = doc.createElement('style')
    style.id = STYLE_ID
    style.textContent = css
    doc.head.appendChild(style)
}
