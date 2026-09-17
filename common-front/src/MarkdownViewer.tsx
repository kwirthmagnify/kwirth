import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/*
    Visor de Markdown compartido por los plugins (agora, excubitor, pinocchio, situs).

    Lleva 'remark-gfm' porque sin el react-markdown NO RENDERIZA TABLAS —lo quito de serie en la v6—
    y una tabla sin el sale como parrafos con pipes sueltos. Se detecto con el informe de auditoria de
    situs, que es casi todo tablas; hasta entonces ningun consumidor generaba ninguna y por eso nadie
    se habia topado con ello.

    ⚠️ GFM añade tablas, tachado, listas de tareas y autoenlaces. NO añade HTML crudo: react-markdown
    lo sigue ignorando, asi que la propiedad de la que depende excubitor —markdown de terceros
    renderizado sin riesgo de XSS— se mantiene intacta.

    Y los enlaces se abren en PESTAÑA NUEVA. Kwirth es una SPA: seguir un enlace en la misma pestaña
    se lleva por delante la sesion entera —canales abiertos, estado, lo que estuvieras mirando— para
    ir a una pagina de la que hay que volver. Con los autoenlaces de GFM esto pasa de conveniente a
    necesario, porque ahora una URL suelta en un mensaje de chat TAMBIEN es un enlace.

    Excubitor lo venia resolviendo por su cuenta interceptando el clic, porque este componente no lo
    hacia. Su apaño sigue funcionando y ya no hace falta.
*/

interface IMarkdownViewerProps {
    content: string
    style?: React.CSSProperties
}

// rel='noopener noreferrer' va con target='_blank' SIEMPRE: sin noopener, la pagina abierta recibe
// una referencia a la ventana de Kwirth y puede navegarla a donde quiera.
const components = {
    a: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
        <a {...rest} href={href} target='_blank' rel='noopener noreferrer'>{children}</a>
}

const MarkdownViewer: React.FC<IMarkdownViewerProps> = ({ content, style }) => {
    return (
        <div style={{ fontSize: 14, lineHeight: 1.6, ...style }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{content}</ReactMarkdown>
        </div>
    )
}

export { MarkdownViewer }
