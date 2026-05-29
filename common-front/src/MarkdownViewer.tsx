import React from 'react'
import ReactMarkdown from 'react-markdown'

interface IMarkdownViewerProps {
    content: string
    style?: React.CSSProperties
}

const MarkdownViewer: React.FC<IMarkdownViewerProps> = ({ content, style }) => {
    return (
        <div style={{ fontSize: 14, lineHeight: 1.6, ...style }}>
            <ReactMarkdown>{content}</ReactMarkdown>
        </div>
    )
}

export { MarkdownViewer }
