import React from 'react'
import { Box, useTheme } from '@mui/material'

/*
    A value shown as JSON coloured by type — keys, strings, literals and numbers — for extensions that only have to
    let it be READ (a provider's event, a sender's request and answer, a message's payload). Deliberately without an
    editor or a tree component: a <pre> weighs far less than an editor per row, and needs no library of its own. The
    colours come from the MUI palette, so they follow the light/dark theme with no extra work.

    Born in provider-debug and moved here (2026-11-15) so that every extension colours JSON the same way.
*/
export interface IJsonBlockProps {
    value: unknown
    /** text to highlight in inverse video; empty or absent means no highlighting. Each match carries data-json-hit, so a search box can scroll to it */
    highlight?: string
    /** upper bound of lines painted; past it the dump is cut and says so. Default 1000 */
    maxLines?: number
    /** appended to the notice of a cut dump — e.g. 'Use the copy button to get the whole object.' */
    trimmedHint?: string
}

// One token per capture: string (with or without a trailing ':', which makes it a key), literal or number.
const TOKEN = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g

/**
 * Default upper bound of lines painted. A single metrics event carries thousands of lines, and tokenising and
 * mounting all of them costs a lot while nobody reads line 4000 by scrolling.
 */
const DEFAULT_MAX_LINES = 1000

const occurrences = (haystack: string, needle: string): number => {
    let count = 0
    let at = haystack.indexOf(needle)
    while (at >= 0) {
        count++
        at = haystack.indexOf(needle, at + needle.length)
    }
    return count
}

const JsonBlock: React.FC<IJsonBlockProps> = (props: IJsonBlockProps) => {
    const theme = useTheme()
    const maxLines = props.maxLines ?? DEFAULT_MAX_LINES

    const colorOf = (token: string): string => {
        if (token.startsWith('"')) return /:\s*$/.test(token) ? theme.palette.primary.main : theme.palette.success.main
        if (token === 'true' || token === 'false' || token === 'null') return theme.palette.secondary.main
        return theme.palette.warning.main
    }

    /**
     * Splits a chunk of text on the searched term and paints the matches in inverse video, keeping the token colour
     * on whatever does not match. Highlighting is applied INSIDE each token, so a search crossing a token boundary
     * (e.g. `": 15`) is not marked: searching a single word is the normal case, and in exchange the whole JSON does
     * not have to be re-tokenised.
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
                // the marker lets a search box centre the MATCH instead of its container: with a JSON of thousands
                // of lines, centring the container leaves the result off screen
                <span key={`${keyBase}-h${at}`} data-json-hit='1' style={{ backgroundColor: theme.palette.text.primary, color: theme.palette.background.paper }}>
                    {text.slice(at, at + needle.length)}
                </span>
            )
            from = at + needle.length
            at = lower.indexOf(target, from)
        }
        if (from < text.length) nodes.push(<span key={`${keyBase}-${from}`} style={color ? { color } : undefined}>{text.slice(from)}</span>)
        return nodes
    }

    /** Serialises the value and trims it, so the cost of the cut is paid before tokenising. */
    const serialize = (): { text: string, full: string, totalLines: number, trimmed: boolean } => {
        let text: string
        try {
            text = JSON.stringify(props.value, null, 2) ?? String(props.value)
        }
        catch {
            // a value with circular references must not bring the view down
            const unserializable = '<unserializable value>'
            return { text: unserializable, full: unserializable, totalLines: 1, trimmed: false }
        }

        const lines = text.split('\n')
        if (lines.length <= maxLines) return { text, full: text, totalLines: lines.length, trimmed: false }
        return { text: lines.slice(0, maxLines).join('\n'), full: text, totalLines: lines.length, trimmed: true }
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
        Matches living past the cut. A search box that counts over the WHOLE value would otherwise promise hits that
        are nowhere to be seen on screen. Counting is two linear scans and only runs when there is both a search and
        a cut.
    */
    const needle = (props.highlight ?? '').trim().toLowerCase()
    const hiddenMatches = (trimmed && needle !== '')
        ? occurrences(full.toLowerCase(), needle) - occurrences(text.toLowerCase(), needle)
        : 0

    const notice = (): string => {
        const head = `Trimmed to the first ${maxLines} of ${totalLines} lines.`
        const tail = props.trimmedHint ? ` ${props.trimmedHint}` : ''
        if (hiddenMatches === 0) return `${head}${tail}`
        const hits = hiddenMatches === 1 ? '1 match falls' : `${hiddenMatches} matches fall`
        return `${head} ${hits} past the cut and cannot be highlighted here.${tail}`
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

export { JsonBlock }
