import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/*
    The Markdown viewer shared by the plugins (agora, excubitor, pinocchio, situs).

    It carries 'remark-gfm' because without it react-markdown DOES NOT RENDER TABLES — it was dropped from
    the defaults in v6 — and a table without it comes out as paragraphs with loose pipes. It was spotted
    with situs's audit report, which is nearly all tables; until then no consumer generated any, and that
    is why nobody had run into it.

    ⚠️ GFM adds tables, strikethrough, task lists and autolinks. It does NOT add raw HTML: react-markdown
    goes on ignoring it, so the property excubitor depends on — third-party markdown rendered with no risk
    of XSS — stays intact.

    And links open in a NEW TAB. Kwirth is an SPA: following a link in the same tab takes the whole session
    down with it — open channels, state, whatever you were looking at — to go to a page you then have to
    come back from. With GFM's autolinks this goes from convenient to necessary, because now a loose URL in
    a chat message is ALSO a link.

    Excubitor had been solving it on its own account by intercepting the click, because this component did
    not. Its workaround still works and is no longer needed.
*/

interface IMarkdownViewerProps {
    content: string
    style?: React.CSSProperties
}

// rel='noopener noreferrer' ALWAYS goes with target='_blank': without noopener, the page that opens
// receives a reference to Kwirth's window and can navigate it wherever it likes.
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
