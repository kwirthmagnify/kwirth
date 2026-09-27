/*
    Sanitizing an SVG that comes from OUTSIDE: an extension's package.json 'icon' field.

    An extension may be installed from a third-party marketplace, so its icon is somebody else's markup,
    and an SVG is not an inert image: it admits <script>, on* handlers, <foreignObject> with HTML inside
    and external references. Painting it with dangerouslySetInnerHTML without filtering would be an XSS
    with the same signature as "I have installed a plugin".

    The criterion is a WHITELIST, not a blacklist: the document is parsed and rebuilt keeping only the
    known drawing elements and attributes. Whatever is not on the list disappears, without trying to
    guess whether it was dangerous. A blacklist always falls short.

    'currentColor' is deliberately preserved: it is what makes the icon follow the theme's colour, just
    like a MUI one. That is why <img src="data:..."> is not used, which would be immune by construction
    but would paint the icon with its fixed colours and look bad in one of the two themes.
*/

const ALLOWED_ELEMENTS = new Set([
    'svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'title'
])

const ALLOWED_ATTRIBUTES = new Set([
    'viewbox', 'width', 'height', 'fill', 'fill-rule', 'clip-rule', 'stroke', 'stroke-width',
    'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'opacity', 'transform',
    'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points'
])

const MAX_LENGTH = 8000

/** Rebuilds an element keeping only what is allowed. Returns undefined when the element will not do. */
const cleanElement = (source: Element, doc: Document): Element | undefined => {
    const name = source.tagName.toLowerCase()
    if (!ALLOWED_ELEMENTS.has(name)) return undefined

    const target = doc.createElementNS('http://www.w3.org/2000/svg', name)
    for (const attribute of Array.from(source.attributes)) {
        const attributeName = attribute.name.toLowerCase()
        if (!ALLOWED_ATTRIBUTES.has(attributeName)) continue
        // Not even in an allowed attribute: a value with url(...) or javascript: draws nothing legitimate
        // in an icon and can reference something external.
        const value = attribute.value
        if (/url\s*\(|javascript:|data:/i.test(value)) continue
        target.setAttribute(attributeName, value)
    }

    for (const child of Array.from(source.children)) {
        const cleanChild = cleanElement(child, doc)
        if (cleanChild) target.appendChild(cleanChild)
    }

    // Text only makes sense inside <title> (accessibility); everywhere else it is discarded.
    if (name === 'title' && source.textContent) target.textContent = source.textContent

    return target
}

/**
 * Returns the sanitised SVG ready to inject, or undefined when the input is not a usable SVG.
 * It never throws: a malformed icon is an icon that is not drawn, not an application error.
 */
export const sanitizeSvg = (raw: string | undefined): string | undefined => {
    if (!raw) return undefined
    const text = raw.trim()
    if (!text.toLowerCase().startsWith('<svg')) return undefined
    if (text.length > MAX_LENGTH) return undefined

    try {
        const parsed = new DOMParser().parseFromString(text, 'image/svg+xml')
        if (parsed.getElementsByTagName('parsererror').length > 0) return undefined

        const root = parsed.documentElement
        if (!root || root.tagName.toLowerCase() !== 'svg') return undefined

        const output = document.implementation.createDocument('http://www.w3.org/2000/svg', 'svg', null)
        const clean = cleanElement(root, output)
        if (!clean) return undefined

        // A size imposed by us: the icon has to fit the card, not decide its size.
        clean.setAttribute('width', '24')
        clean.setAttribute('height', '24')
        if (!clean.getAttribute('viewBox')) clean.setAttribute('viewBox', '0 0 24 24')

        return new XMLSerializer().serializeToString(clean)
    }
    catch {
        return undefined
    }
}
