import React, { useCallback, useEffect, useRef, useState } from 'react'
import { SxProps, Theme, Tooltip, Typography } from '@mui/material'

/*
    Un texto recortado que enseña el texto COMPLETO al pasar por encima.

    Las tarjetas recortan el nombre a una linea y la descripcion a dos, porque si no una descripcion larga
    estira la tarjeta y con ella toda su fila del grid. Pero recortar dejaba el texto completo sin ningun
    sitio donde leerse: el enlace de la tarjeta lleva a la WEB de la extension, que es otra cosa y mucho
    mas larga, cuando lo que se quiere es leer esa descripcion.

    ⚠️ El tooltip solo aparece si el texto ESTA recortado de verdad. Ponerlo siempre repetiria lo que ya
    se lee —ruido en cada tarjeta— asi que se mide el nodo: si lo que ocupa el contenido no cabe en la
    caja, hay recorte. Se vuelve a medir cuando cambia el tamaño, porque el diálogo es elastico (72vw) y
    lo que cabe en una ventana ancha no cabe en una estrecha.
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
        // Una linea se pasa a lo ANCHO y varias a lo ALTO (el clamp de -webkit-box), asi que se miran las
        // dos: 1px de margen para no marcar recorte por un redondeo del navegador.
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
    // El tooltip respeta los saltos de linea del texto: una descripcion de varias frases se lee mejor asi
    // que en un parrafo corrido.
    return <Tooltip title={text} slotProps={{ tooltip: { sx: { whiteSpace: 'pre-wrap', maxWidth: 420 } } }}>{texto}</Tooltip>
}

export { TruncatedText }
