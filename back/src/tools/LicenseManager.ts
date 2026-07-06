import crypto from 'crypto'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { ELogComponent, logError, logInfo } from './Logging'

// Generate your key pair with: node scripts/generate-license-keys.mjs
// Then replace this placeholder with the content of license-public.pem
const LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
REPLACE_WITH_YOUR_PUBLIC_KEY
-----END PUBLIC KEY-----`

interface ILicensePayload {
    customerId: string
    extensions: Partial<Record<EExtensionType, string[]>>
    expiry: string
    signature: string
}

// deterministic serialization — must match sign-license.mjs
function stableStringify(obj: any): string {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return JSON.stringify(obj)
    return '{' + Object.keys(obj).sort().map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}'
}

export class LicenseManager {
    private license: ILicensePayload | null = null
    private valid = false
    private hasLicense = false

    load(): void {
        const raw = process.env.KWIRTH_LICENSE
        if (!raw) {
            logInfo(ELogComponent.CORE, 'No license configured — running in open source mode')
            return
        }
        this.hasLicense = true
        try {
            const json = Buffer.from(raw, 'base64').toString('utf-8')
            const parsed: ILicensePayload = JSON.parse(json)
            if (!this.verify(parsed)) {
                logError(ELogComponent.CORE, 'License signature is invalid')
                return
            }
            if (new Date(parsed.expiry) < new Date()) {
                logError(ELogComponent.CORE, `License expired on ${parsed.expiry}`)
                return
            }
            this.license = parsed
            this.valid = true
            logInfo(ELogComponent.CORE, `License valid — customer '${parsed.customerId}', expires ${parsed.expiry}`)
        } catch (err) {
            logError(ELogComponent.CORE, `Failed to parse license: ${err}`)
        }
    }

    private verify(license: ILicensePayload): boolean {
        try {
            const { signature, ...payload } = license
            const verifier = crypto.createVerify('RSA-SHA256')
            verifier.update(stableStringify(payload))
            return verifier.verify(LICENSE_PUBLIC_KEY, signature, 'base64')
        } catch {
            return false
        }
    }

    isExtensionLicensed(type: EExtensionType, id: string): boolean {
        if (!this.hasLicense) return true
        if (!this.valid || !this.license) return false
        return this.license.extensions[type]?.includes(id) ?? false
    }

    isValid(): boolean {
        return !this.hasLicense || this.valid
    }

    getPublicInfo(): { customerId: string; extensions: Partial<Record<EExtensionType, string[]>>; expiry: string } | null {
        if (!this.valid || !this.license) return null
        const { signature: _, ...info } = this.license
        return info
    }
}
