// Usage: node scripts/sign-license.mjs <private-key.pem> <license-template.json>
//
// Example license-template.json:
// {
//   "customerId": "acme-corp",
//   "extensions": {
//     "channels": ["montag"],
//     "daemons": [],
//     "providers": [],
//     "senders": [],
//     "homepages": [],
//     "themes": []
//   },
//   "expiry": "2027-01-01"
// }

import crypto from 'crypto'
import fs from 'fs'

const [,, keyPath, templatePath] = process.argv
if (!keyPath || !templatePath) {
    console.error('Usage: node scripts/sign-license.mjs <private-key.pem> <license-template.json>')
    process.exit(1)
}

function stableStringify(obj) {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return JSON.stringify(obj)
    return '{' + Object.keys(obj).sort().map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}'
}

const privateKey = fs.readFileSync(keyPath, 'utf-8')
const template = JSON.parse(fs.readFileSync(templatePath, 'utf-8'))
const { signature: _discard, ...payload } = template

const signer = crypto.createSign('RSA-SHA256')
signer.update(stableStringify(payload))
const signature = signer.sign(privateKey, 'base64')

const license = { ...payload, signature }
const encoded = Buffer.from(JSON.stringify(license)).toString('base64')

console.log('=== License JSON ===')
console.log(JSON.stringify(license, null, 2))
console.log('')
console.log('=== KWIRTH_LICENSE env var (base64) ===')
console.log(encoded)
