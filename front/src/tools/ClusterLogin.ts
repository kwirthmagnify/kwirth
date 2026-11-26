import { sha256 } from 'js-sha256'
import { AccessKey, accessKeySerialize } from '@kwirthmagnify/kwirth-common'
import { Cluster, EClusterCredentials } from '../model/Cluster'
import { resolvedClusterUrl, unresolvedRouteMessage } from './ClusterRouting'
import { addPostAuthorization } from './AuthorizationManagement'
import { clusterLoginOutcomeOf, clusterLoginUnreachable, EClusterLoginOutcome, IClusterLoginOutcome } from './ClusterLoginOutcome'

/*
    Signing in to a REMOTE Kwirth from an entry of the cluster list whose credentials are LOGIN
    (plan: plans/completed/cluster-login/PRD.md).

    The remote's user has nothing to do with the user of THIS Kwirth: logged in here as 'admin', the remote may be
    entered as any of its own users, with its permissions. The password is sent the way Kwirth's own login sends it
    (sha256) and is never kept: only the key the remote hands out, in the entry's accessString (D2), so the rest of
    the front uses the entry exactly like any other.

    The request goes where everything else for that entry goes — directly or through its router — so a cluster
    behind a bridge or Ianus can be signed in to as well (D1).
*/

/** The entry signs in instead of carrying a key. */
export const isLoginCluster = (cluster: Cluster): boolean => cluster.credentials === EClusterCredentials.LOGIN

/** Using it now needs a sign-in first: it has no key yet, or the remote refused the one it had. */
export const needsLogin = (cluster: Cluster): boolean =>
    isLoginCluster(cluster) && (!cluster.accessString || cluster.loginExpired === true)

/*
    The session of a LOGIN entry in a few words, the same in Manage clusters and in the cluster selector:
    'as <user>' when it has one, 'session expired' when the remote refused it, 'login required' with none.
    Empty for an entry with a key: it has no session to speak of.
*/
export const loginStatusOf = (cluster: Cluster): string => {
    if (!isLoginCluster(cluster)) return ''
    if (cluster.accessString && cluster.loginExpired) return 'session expired'
    if (cluster.accessString) return `as ${cluster.remoteUser ?? '?'}`
    return 'login required'
}

/** Signs in to the remote and, on success, keeps the key and the remote user in the entry. */
export const loginToCluster = async (cluster: Cluster, user: string, password: string): Promise<IClusterLoginOutcome> => {
    const base = resolvedClusterUrl(cluster)
    if (!base) return { outcome: EClusterLoginOutcome.UNREACHABLE, message: unresolvedRouteMessage(cluster) }
    let response: Response
    try {
        response = await fetch(`${base}/login`, addPostAuthorization('', JSON.stringify({ user, password: sha256(password) })))
    }
    catch (err) {
        return clusterLoginUnreachable(err)
    }
    let body: unknown = undefined
    try { body = await response.json() } catch { /* 201 and some refusals carry no JSON */ }
    const result = clusterLoginOutcomeOf(response.status, body, response.headers.get('Retry-After'))
    if (result.outcome !== EClusterLoginOutcome.OK) return result

    const accessKey = body && typeof body === 'object' ? (body as { accessKey?: AccessKey }).accessKey : undefined
    if (!accessKey || typeof accessKey.id !== 'string' || typeof accessKey.type !== 'string') {
        return { outcome: EClusterLoginOutcome.FAILED, message: 'That Kwirth accepted the sign-in but sent no access key.' }
    }
    cluster.accessString = accessKeySerialize(accessKey)
    cluster.remoteUser = user
    cluster.loginExpired = false
    return result
}

/** Forgets the key and the remote user: the next use asks for credentials again, possibly as another user. */
export const signOutOfCluster = (cluster: Cluster): void => {
    cluster.accessString = ''
    cluster.remoteUser = undefined
    cluster.loginExpired = false
    cluster.kwirthData = undefined
}
