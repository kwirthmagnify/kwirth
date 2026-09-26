import React from 'react'
import { Box, useTheme } from '@mui/material'

interface IJsonBlockProps {
    value: unknown
    /** text to highlight in inverse video; empty or absent means no highlighting */
    highlight?: string
}

// One token per capture: string (with or without a trailing ':', which makes it a key), literal or number.
const TOKEN = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g

/**
 * Upper bound of lines painted per event. A single metrics event carries thousands of lines, and
 * tokenising and mounting all of them costs a lot while nobody reads line 4000 by scrolling. The
 * copy button is unaffected: it always yields the WHOLE object, which is what the notice points at.
 */
const MAX_RENDERED_LINES = 1000

/**
 * JSON dump coloured by type. Deliberately without CodeMirror: here the event only has to be READ,
 * and a <pre> weighs far less than an editor per buffer entry. Colours come from the MUI palette,
 * so they follow the light/dark theme with no extra work.
 */
export const JsonBlock: React.FC<IJsonBlockProps> = (props: IJsonBlockProps) => {
    const theme = useTheme()

    const colorOf = (token: string): string => {
        if (token.startsWith('"')) return token.trimEnd().endsWith(':') ? theme.palette.primary.main : theme.palette.success.main
        if (token === 'true' || token === 'false' || token === 'null') return theme.palette.secondary.main
        return theme.palette.warning.main
    }

    /**
     * Splits a chunk of text on the searched term and paints the matches in inverse video, keeping
     * the token colour on whatever does not match. Highlighting is applied INSIDE each token, so a
     * search crossing a token boundary (e.g. `": 15`) is not marked: searching a single word is the
     * normal case, and in exchange the whole JSON does not have to be re-tokenised.
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
                // the marker lets the search box centre the MATCH instead of the card: with a JSON of
                // thousands of lines, centring the card leaves the result off screen
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

    /** Serialises the event and trims it, so the cost of the cut is paid before tokenising. */
    const serialize = (): { text: string, full: string, totalLines: number, trimmed: boolean } => {
        let text: string
        try {
            text = JSON.stringify(props.value, null, 2) ?? String(props.value)
        }
        catch {
            // an event with circular references must not bring the tab down: that is exactly what we came to look at
            const unserializable = '<unserializable event>'
            return { text: unserializable, full: unserializable, totalLines: 1, trimmed: false }
        }

        const lines = text.split('\n')
        if (lines.length <= MAX_RENDERED_LINES) return { text, full: text, totalLines: lines.length, trimmed: false }
        return { text: lines.slice(0, MAX_RENDERED_LINES).join('\n'), full: text, totalLines: lines.length, trimmed: true }
    }

    const occurrences = (haystack: string, needle: string): number => {
        let count = 0
        let at = haystack.indexOf(needle)
        while (at >= 0) {
            count++
            at = haystack.indexOf(needle, at + needle.length)
        }
        return count
    }

    const render = (text: string): React.ReactNode[] => {
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

    const { text, full, totalLines, trimmed } = serialize()

    /*
        Matches living past the cut. The search box counts over the WHOLE event, so without saying
        this the counter would promise hits that are nowhere to be seen on screen, and jumping to one
        of them would silently land on the card instead of on a highlight. Counting is two linear
        scans and only runs when there is both a search and a cut.
    */
    const needle = (props.highlight ?? '').trim().toLowerCase()
    const hiddenMatches = (trimmed && needle !== '')
        ? occurrences(full.toLowerCase(), needle) - occurrences(text.toLowerCase(), needle)
        : 0

    const notice = (): string => {
        const head = `Trimmed to the first ${MAX_RENDERED_LINES} of ${totalLines} lines.`
        const tail = 'Use the copy button to get the whole object.'
        if (hiddenMatches === 0) return `${head} ${tail}`
        const hits = hiddenMatches === 1 ? '1 match falls' : `${hiddenMatches} matches fall`
        return `${head} ${hits} past the cut and cannot be highlighted here. ${tail}`
    }

    return (
        <>
            <Box component='pre' sx={{ m: 0, fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', overflowX: 'auto' }}>
                {render(text)}
            </Box>
            {trimmed &&
                <Box sx={{ mt: 0.5, fontSize: '0.65rem', fontStyle: 'italic', color: hiddenMatches > 0 ? 'warning.main' : 'text.secondary' }}>
                    {notice()}
                </Box>
            }
        </>
    )
}
