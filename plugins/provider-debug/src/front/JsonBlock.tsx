import React from 'react'
import { Box, useTheme } from '@mui/material'

interface IJsonBlockProps {
    value: unknown
    /** texto a resaltar en vídeo inverso; vacío o ausente = sin resaltado */
    highlight?: string
}

// Un token por captura: cadena (con o sin ':' detrás, que la convierte en clave), literal o número.
const TOKEN = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g

/**
 * Volcado JSON con coloreado por tipo. Deliberadamente sin CodeMirror: aquí solo hay que LEER el
 * evento, y un <pre> pesa mucho menos que un editor por cada entrada del buffer. Los colores salen
 * de la paleta MUI, así que siguen al tema claro/oscuro sin tocar nada.
 */
export const JsonBlock: React.FC<IJsonBlockProps> = (props: IJsonBlockProps) => {
    const theme = useTheme()

    const colorOf = (token: string): string => {
        if (token.startsWith('"')) return token.trimEnd().endsWith(':') ? theme.palette.primary.main : theme.palette.success.main
        if (token === 'true' || token === 'false' || token === 'null') return theme.palette.secondary.main
        return theme.palette.warning.main
    }

    /**
     * Parte un trozo de texto por el término buscado y pinta las coincidencias en vídeo inverso,
     * conservando el color del token en lo que no casa. El resaltado se aplica DENTRO de cada
     * token, así que una búsqueda que cruce la frontera de dos tokens (p.ej. `": 15`) no se marca:
     * lo normal es buscar una palabra, y a cambio no hay que re-tokenizar el JSON entero.
     */
    const paint = (text: string, color: string | undefined, keyBase: string): React.ReactNode[] => {
        const needle = (props.highlight ?? '').trim()
        if (needle === '') return [<span key={keyBase} style={color ? { color } : undefined}>{text}</span>]

        const nodes: React.ReactNode[] = []
        const lower = text.toLowerCase()
        const target = needle.toLowerCase()
        let from = 0
        let at = lower.indexOf(target)
        while (at >= 0) {
            if (at > from) nodes.push(<span key={`${keyBase}-${from}`} style={color ? { color } : undefined}>{text.slice(from, at)}</span>)
            nodes.push(
                // el marcador permite que el buscador centre la COINCIDENCIA y no la tarjeta: con un
                // JSON de miles de líneas, centrar la tarjeta deja el resultado fuera de pantalla
                <span key={`${keyBase}-h${at}`} data-pd-hit='1' style={{ backgroundColor: theme.palette.text.primary, color: theme.palette.background.paper }}>
                    {text.slice(at, at + needle.length)}
                </span>
            )
            from = at + needle.length
            at = lower.indexOf(target, from)
        }
        if (from < text.length) nodes.push(<span key={`${keyBase}-${from}`} style={color ? { color } : undefined}>{text.slice(from)}</span>)
        return nodes
    }

    const render = (): React.ReactNode[] => {
        let text: string
        try {
            text = JSON.stringify(props.value, null, 2) ?? String(props.value)
        }
        catch {
            // un evento con referencias cíclicas no debe tumbar la pestaña: es justo lo que venimos a ver
            return [<span key='err'>{'<unserializable event>'}</span>]
        }

        const nodes: React.ReactNode[] = []
        let last = 0
        let match: RegExpExecArray | null
        TOKEN.lastIndex = 0
        while ((match = TOKEN.exec(text)) !== null) {
            if (match.index > last) nodes.push(...paint(text.slice(last, match.index), undefined, `p${last}`))
            nodes.push(...paint(match[0], colorOf(match[0]), `t${match.index}`))
            last = match.index + match[0].length
        }
        if (last < text.length) nodes.push(...paint(text.slice(last), undefined, `p${last}`))
        return nodes
    }

    return (
        <Box component='pre' sx={{ m: 0, fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', overflowX: 'auto' }}>
            {render()}
        </Box>
    )
}
