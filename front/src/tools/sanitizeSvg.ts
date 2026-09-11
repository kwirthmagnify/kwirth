/*
    Saneado de un SVG que viene de FUERA: el campo 'icon' del package.json de una extension.

    Una extension puede instalarse desde un marketplace de terceros, asi que su icono es markup ajeno,
    y un SVG no es una imagen inerte: admite <script>, manejadores on*, <foreignObject> con HTML dentro
    y referencias externas. Pintarlo con dangerouslySetInnerHTML sin filtrar seria un XSS con la misma
    firma que "he instalado un plugin".

    El criterio es LISTA BLANCA, no lista negra: se parsea el documento y se reconstruye dejando solo
    los elementos y atributos de dibujo conocidos. Lo que no este en la lista desaparece, sin intentar
    adivinar si era peligroso. Una lista negra siempre se queda corta.

    Se conserva 'currentColor' a proposito: es lo que hace que el icono siga el color del tema, igual
    que uno de MUI. Por eso no se usa <img src="data:...">, que seria inmune por construccion pero
    pintaria el icono con sus colores fijos y se veria mal en uno de los dos temas.
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

/** Reconstruye un elemento dejando solo lo permitido. Devuelve undefined si el elemento no vale. */
const cleanElement = (source: Element, doc: Document): Element | undefined => {
    const name = source.tagName.toLowerCase()
    if (!ALLOWED_ELEMENTS.has(name)) return undefined

    const target = doc.createElementNS('http://www.w3.org/2000/svg', name)
    for (const attribute of Array.from(source.attributes)) {
        const attributeName = attribute.name.toLowerCase()
        if (!ALLOWED_ATTRIBUTES.has(attributeName)) continue
        // Ni siquiera en un atributo permitido: un valor con url(...) o javascript: no dibuja nada
        // legitimo en un icono y si puede referenciar algo externo.
        const value = attribute.value
        if (/url\s*\(|javascript:|data:/i.test(value)) continue
        target.setAttribute(attributeName, value)
    }

    for (const child of Array.from(source.children)) {
        const cleanChild = cleanElement(child, doc)
        if (cleanChild) target.appendChild(cleanChild)
    }

    // El texto solo tiene sentido dentro de <title> (accesibilidad); en el resto se descarta.
    if (name === 'title' && source.textContent) target.textContent = source.textContent

    return target
}

/**
 * Devuelve el SVG saneado listo para inyectar, o undefined si la entrada no es un SVG utilizable.
 * Nunca lanza: un icono malformado es un icono que no se pinta, no un error de la aplicacion.
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

        // Tamaño impuesto por nosotros: el icono tiene que encajar en la tarjeta, no decidir su tamaño.
        clean.setAttribute('width', '24')
        clean.setAttribute('height', '24')
        if (!clean.getAttribute('viewBox')) clean.setAttribute('viewBox', '0 0 24 24')

        return new XMLSerializer().serializeToString(clean)
    }
    catch {
        return undefined
    }
}
