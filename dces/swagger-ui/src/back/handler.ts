import type { RequestHandler } from 'express'
import { ISwaggerUiOptions } from '../common/index'

/*
    The page and Swagger UI's files, served from strings (the core loads this DCE's back.js from a ConfigMap: there
    is no node_modules to read them from at run time, so the build puts them inside).

    Written against Node's plain response (statusCode, setHeader, end), which express's response is too: the
    harness drives it with a fake, without a server.
*/

export interface ISwaggerUiAssets {
    bundleJs: string
    css: string
    version: string
}

// What the handler reads of a request and writes on a response: Node's own, a subset of express's.
export interface IHandlerRequest {
    url?: string                   // relative to where the handler is mounted
    originalUrl?: string           // the whole path, as the client asked for it
    method?: string
}

export interface IHandlerResponse {
    statusCode: number
    setHeader(name: string, value: string): unknown
    end(body?: string): unknown
}

const escapeHtml = (text: string): string =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// A value written inside a <script>: as JSON, and without a '</script>' that would close it.
const scriptValue = (value: string): string => JSON.stringify(value).replace(/</g, '\\u003c')

export const pageHtml = (options: ISwaggerUiOptions): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(options.title)}</title>
<link rel="stylesheet" href="swagger-ui.css">
</head>
<body>
<div id="swagger-ui"></div>
<script src="swagger-ui-bundle.js"></script>
<script>
window.ui = SwaggerUIBundle({ url: ${scriptValue(options.specUrl)}, dom_id: '#swagger-ui', deepLinking: true, tryItOutEnabled: false })
</script>
</body>
</html>`

const send = (res: IHandlerResponse, status: number, type: string, body: string, cache: boolean): void => {
    res.statusCode = status
    res.setHeader('Content-Type', type)
    res.setHeader('Cache-Control', cache ? 'public, max-age=3600' : 'no-store')
    res.end(body)
}

export const createHandler = (assets: ISwaggerUiAssets, options: ISwaggerUiOptions): RequestHandler => {
    const page = pageHtml(options)
    const handle = (req: IHandlerRequest, res: IHandlerResponse, next: (err?: unknown) => void): void => {
        if (req.method && req.method !== 'GET' && req.method !== 'HEAD') { next(); return }
        const [path] = (req.url ?? '/').split('?')
        switch (path) {
            case '/':
            case '': {
                // The page's files are relative to it: without the trailing slash they would resolve one level up.
                const [whole, query] = (req.originalUrl ?? '').split('?')
                if (whole && !whole.endsWith('/')) {
                    res.statusCode = 301
                    res.setHeader('Location', `${whole}/${query !== undefined ? `?${query}` : ''}`)
                    res.end()
                    return
                }
                send(res, 200, 'text/html; charset=utf-8', page, false)
                return
            }
            case '/swagger-ui.css':
                send(res, 200, 'text/css; charset=utf-8', assets.css, true)
                return
            case '/swagger-ui-bundle.js':
                send(res, 200, 'application/javascript; charset=utf-8', assets.bundleJs, true)
                return
            default:
                next()
        }
    }
    return handle as unknown as RequestHandler
}
