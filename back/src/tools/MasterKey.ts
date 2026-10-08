import * as crypto from 'crypto'
import { IConfigMaps } from './IConfigMap'
import { ELogComponent, logWarning } from './Logging'

// Where an auto-generated master key is kept when MASTERKEY is not supplied. It lives in the PLAIN store
// (configMaps), never in secrets: NodeSecrets encrypts WITH the master key, so storing it there would be a
// chicken-and-egg. Key and encrypted store share the same volume, so they share fate on a restart.
export const MASTERKEY_STORE_KEY = 'kwirth-master-key'

/*
    Resolves the master key that signs bearer keys and —in FILE stores— encrypts the secrets at rest:
      1. explicit MASTERKEY env  → used as is (Tier 2: the key stays outside the store, real at-rest encryption)
      2. one already in the store → reused (a restart finds the key it generated the first time)
      3. none                     → generated and persisted in the PLAIN store (configMaps), never in secrets

    It is kept in configMaps, not secrets, because NodeSecrets encrypts WITH this key (chicken-and-egg).
    Key and encrypted store share the same volume, so they share fate: a restart that keeps the volume
    keeps both; one that loses it loses both. There is never a persisted store orphaned from its key.

    When it is generated, at-rest encryption becomes obfuscation —the key sits next to the ciphertext— so
    the warning says so plainly instead of claiming protection it does not give.
*/
export const resolveMasterKey = async (envKey: string | undefined, configMaps: IConfigMaps, durable: boolean): Promise<string> => {
    if (envKey) return envKey

    const stored = (await configMaps.read(MASTERKEY_STORE_KEY))?.value
    if (stored) return stored

    const generated = crypto.randomBytes(32).toString('hex')
    await configMaps.write(MASTERKEY_STORE_KEY, { value: generated })
    logWarning(ELogComponent.CORE, 'MASTERKEY not set: generated and stored. This stops credential forgery, but since the key lives next to the encrypted store, at-rest encryption is not effective against anyone who can read the volume. For real at-rest protection, provide MASTERKEY from outside the store (e.g. a Kubernetes Secret).')
    if (!durable) logWarning(ELogComponent.CORE, 'The store is not durable (no persistent volume): the generated MASTERKEY will rotate on every restart and invalidate issued API keys. Set MASTERKEY or mount a persistent volume.')
    return generated
}
