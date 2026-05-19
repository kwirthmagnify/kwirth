#!/usr/bin/env node
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.argv[2] ? parseInt(process.argv[2]) : 4000

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'text/javascript',
  '.mjs':  'text/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.md':   'text/plain; charset=utf-8',
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0])
  if (urlPath === '/') urlPath = '/index.html'

  let filePath = path.join(ROOT, urlPath)

  // If no extension and no trailing slash, try .html then directory index
  if (!path.extname(filePath)) {
    if (fs.existsSync(filePath + '.html')) {
      filePath = filePath + '.html'
    } else if (fs.existsSync(path.join(filePath, 'index.html'))) {
      filePath = path.join(filePath, 'index.html')
    }
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const idx = path.join(filePath.replace(/\/$/, ''), 'index.html')
    if (fs.existsSync(idx)) {
      filePath = idx
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end(`404 Not Found: ${urlPath}`)
      return
    }
  }

  const ext = path.extname(filePath).toLowerCase()
  const mime = MIME[ext] || 'application/octet-stream'

  try {
    const data = fs.readFileSync(filePath)
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' })
    res.end(data)
    console.log(`  200  ${urlPath}`)
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end('500 Internal Server Error')
  }
})

server.listen(PORT, () => {
  console.log(`\n  kwirth docs  →  http://localhost:${PORT}\n`)
  console.log('  Press Ctrl+C to stop.\n')
})
