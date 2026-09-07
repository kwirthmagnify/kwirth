import React from 'react'
import { Box, useTheme } from '@mui/material'

interface IJsonBlockProps {
    value: unknown
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
            if (match.index > last) nodes.push(<span key={`p${last}`}>{text.slice(last, match.index)}</span>)
            nodes.push(<span key={`t${match.index}`} style={{ color: colorOf(match[0]) }}>{match[0]}</span>)
            last = match.index + match[0].length
        }
        if (last < text.length) nodes.push(<span key={`p${last}`}>{text.slice(last)}</span>)
        return nodes
    }

    return (
        <Box component='pre' sx={{ m: 0, fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', overflowX: 'auto' }}>
            {render()}
        </Box>
    )
}
