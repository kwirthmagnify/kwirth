import crypto from 'crypto'
import fs from 'fs'

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
})

fs.writeFileSync('license-private.pem', privateKey)
fs.writeFileSync('license-public.pem', publicKey)

console.log('Generated license-private.pem and license-public.pem')
console.log('')
console.log('IMPORTANT:')
console.log('  - Keep license-private.pem SECRET. Never commit it.')
console.log('  - Copy the content of license-public.pem into back/src/tools/LicenseManager.ts (LICENSE_PUBLIC_KEY)')
console.log('')
console.log('Public key:')
console.log(publicKey)
