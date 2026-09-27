import React, { useCallback, useEffect, useRef, useState } from 'react'
import { SxProps, Theme, Tooltip, Typography } from '@mui/material'

/*
    A truncated text that shows the FULL text on hover.

    The cards truncate the name to one line and the description to two, because otherwise a long
    description stretches the card and with it the whole of its grid row. But truncating left the full
    text with nowhere to be read: the card's link leads to the extension's WEBSITE, which is another
    thing entirely and much longer, when what is wanted is to read that description.

    ⚠️ The tooltip only appears if the text IS genuinely truncated. Having it always would repeat what is
    already legible —noise on every card— so the node is measured: if what the content takes up does not
    fit in the box, there is truncation. It is measured again when the size changes, because the dialog
    is elastic (72vw) and what fits in a wide window does not fit in a narrow one.
*/
const TruncatedText: React.FC<{
    text: string
    variant: 'body2' | 'caption'
    color?: string
    fontWeight?: 'bold'
    sx?: SxProps<Theme>
}> = ({ text, variant, color, fontWeight, sx }) => {
    const ref = useRef<HTMLElement>(null)
    const [recortado, setRecortado] = useState(false)

    const medir = useCallback(() => {
        const el = ref.current
        if (!el) return
        // A single line overflows in WIDTH and several in HEIGHT (-webkit-box's clamp), so both are
        // looked at: a 1px margin so a browser rounding does not flag a truncation.
        setRecortado(el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
    }, [])

    useEffect(() => {
        medir()
        const el = ref.current
        if (!el || typeof ResizeObserver === 'undefined') return
        const observer = new ResizeObserver(() => requestAnimationFrame(medir))
        observer.observe(el)
        return () => observer.disconnect()
    }, [medir, text])

    const texto = (
        <Typography ref={ref} variant={variant} color={color} fontWeight={fontWeight} display='block' sx={sx}>
            {text}
        </Typography>
    )

    if (!recortado) return texto
    // The tooltip honours the text's line breaks: a description of several sentences reads better that
    // way than as a running paragraph.
    return <Tooltip title={text} slotProps={{ tooltip: { sx: { whiteSpace: 'pre-wrap', maxWidth: 420 } } }}>{texto}</Tooltip>
}

export { TruncatedText }
