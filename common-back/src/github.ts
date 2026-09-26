import { IIdpIdentity } from './IIdpConnector'

/*
    Mapper de identidad de GitHub compartido por los conectores github-cloud / github-onprem.
    GitHub NO es OIDC: con el access_token se consultan GET /user (nombre/login/id) y GET /user/emails
    (email primary verificado). apiBaseUrl = https://api.github.com (cloud) o https://<ghe-host>/api/v3.
*/

interface IGithubUser {
    login: string
    name?: string | null
    email?: string | null
    id?: number
}

interface IGithubEmail {
    email: string
    primary: boolean
    verified: boolean
}

async function ghGet<T>(base: string, resource: string, accessToken: string): Promise<T> {
    const res = await fetch(`${base}${resource}`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'kwirth'
        }
    })
    if (!res.ok) throw new Error(`GitHub API ${resource} returned ${res.status}`)
    return res.json() as Promise<T>
}

export async function githubIdentityFromToken(apiBaseUrl: string, accessToken: string): Promise<IIdpIdentity> {
    const base = apiBaseUrl.replace(/\/+$/, '')
    const user = await ghGet<IGithubUser>(base, '/user', accessToken)
    // /user/emails can fail when the user:email scope is missing; in that case we fall back to the public email
    const emails = await ghGet<IGithubEmail[]>(base, '/user/emails', accessToken).catch(() => [] as IGithubEmail[])
    // we prefer the primary email; failing that, the first verified one; failing that, the first there is
    const chosen = emails.find(e => e.primary) ?? emails.find(e => e.verified) ?? emails[0]
    return {
        email: chosen?.email ?? user.email ?? '',
        emailVerified: chosen?.verified === true,
        name: user.name ?? user.login,
        sub: user.id !== undefined ? String(user.id) : undefined
    }
}
