import React, { useContext, useState } from 'react'
import { Button, CircularProgress, Dialog, DialogActions, DialogContent, FormControlLabel, Stack, Switch, TextField, Typography } from '@mui/material'
import { DialogTitleHelp, docsUrl } from '@kwirthmagnify/kwirth-common-front'
import { IConfigFieldDef, IConfigValidationError, IIdpSignupPolicy } from '@kwirthmagnify/kwirth-common'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { addPostAuthorization, addPutAuthorization } from '../../tools/AuthorizationManagement'
import { ConfigFields } from './ConfigFields'
import type { ISaveRefusal } from './ConfigFormDialog'

/*
    An identity provider's configuration: a connector's INSTANCE.

    A connector (google, entra, github…) is what gets installed; the instance is that connector already
    configured and switched on. There is ONE per connector —its id is the connector's— so even though
    they are two entities in the back end, on the screen they behave like an extension and its
    configuration.

    Secrets arrive REAL with the rest of the instance, like any other value (CLAUDE.md): the field masks
    them and the eye shows them. What is saved is what the form holds, whole.
*/

interface IIdpInstance {
    id: string
    connectorId: string
    label: string
    enabled: boolean
    config: Record<string, unknown>
    signup?: IIdpSignupPolicy
}

// the domains are typed as one comma-separated line; stored as a list without blanks or case
const parseDomains = (text: string): string[] =>
    text.split(',').map(d => d.trim().toLowerCase()).filter(d => d !== '')

/** The connectors' own name for the field; the core reads it to build the redirect_uri. */
const REDIRECT_URI_FIELD = 'redirectUri'

/*
    The value the admin has to register at the provider, suggested so they do not have to compose it by
    hand — it must match BYTE FOR BYTE or the provider answers 'invalid redirect uri'.

    'backendUrl' is already the public origin plus the ROOTPATH, so it carries the subpath a deployment
    hangs off ('/kwirth'), which is what the documentation used to omit. The scheme is forced to https
    because OAuth2 only accepts http on loopback — and the back end cannot derive it: inside the pod the
    connection is plain HTTP, so a proxy that does not send 'X-Forwarded-Proto' yields 'http://' for a
    site the browser reached over HTTPS.
*/
const defaultRedirectUri = (backendUrl: string, instanceId: string): string => {
    try {
        const url = new URL(backendUrl)
        if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) url.protocol = 'https:'
        const base = `${url.origin}${url.pathname}`.replace(/\/+$/, '')
        return `${base}/core/auth/${instanceId}/callback`
    }
    catch (err) { return '' }
}

interface IIdpConfigDialogProps {
    /** The connector it belongs to: the name and the form's fields come from it. */
    connectorId: string
    connectorLabel: string
    schema: IConfigFieldDef[]
    /** The stored instance, if it already exists. Without it, one is being created. */
    existing?: IIdpInstance
    onClose: () => void
}

const IdpConfigDialog: React.FC<IIdpConfigDialogProps> = (props: IIdpConfigDialogProps) => {
    const { accessString, backendUrl } = useContext(SessionContext) as SessionContextType
    const esNueva = !props.existing
    const [instancia, setInstancia] = useState<IIdpInstance>(() => {
        const base: IIdpInstance = props.existing
            ? { ...props.existing, config: { ...props.existing.config } }
            : { id: props.connectorId, connectorId: props.connectorId, label: props.connectorLabel, enabled: false, config: {} }
        // Only as a suggestion, and only while the connector offers the field and nothing has been saved
        // in it: a value stored under a key no form shows would be invisible and impossible to correct.
        if (props.schema.some(f => f.name === REDIRECT_URI_FIELD) && !base.config[REDIRECT_URI_FIELD]) {
            const sugerida = defaultRedirectUri(backendUrl, base.id)
            if (sugerida) base.config[REDIRECT_URI_FIELD] = sugerida
        }
        return base
    })
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | undefined>()
    const [fieldErrors, setFieldErrors] = useState<IConfigValidationError[]>([])
    const [signupEnabled, setSignupEnabled] = useState<boolean>(props.existing?.signup?.enabled === true)
    const [signupDomains, setSignupDomains] = useState<string>(props.existing?.signup?.allowedDomains?.join(', ') ?? '')

    // Editing a field the back end refused takes its mark and its message away
    const setCampo = (name: string, value: unknown) => {
        setInstancia(prev => ({ ...prev, config: { ...prev.config, [name]: value } }))
        setFieldErrors(list => list.filter(e => e.field !== name))
    }

    const guardar = async () => {
        setSaving(true)
        setError(undefined)
        setFieldErrors([])
        try {
            const signup: IIdpSignupPolicy = { enabled: signupEnabled, allowedDomains: parseDomains(signupDomains) }
            const payload = JSON.stringify({ ...instancia, signup })
            const res = esNueva
                ? await fetch(`${backendUrl}/core/idps/instances`, addPostAuthorization(accessString, payload))
                : await fetch(`${backendUrl}/core/idps/instances/${instancia.id}`, addPutAuthorization(accessString, payload))
            if (!res.ok) {
                const refusal = await res.json().catch(() => undefined) as ISaveRefusal | undefined
                // What does not fit the connector's schema: marked on its field, and said why
                if (res.status === 400 && refusal?.fields && refusal.fields.length > 0) {
                    setFieldErrors(refusal.fields)
                    return
                }
                throw new Error(refusal?.error ?? `HTTP ${res.status}`)
            }
            props.onClose()
        }
        catch (err) { setError(`Failed to save '${instancia.id}': ${err}`) }
        finally { setSaving(false) }
    }

    return (
        <Dialog open={true} maxWidth='sm' fullWidth>
            <DialogTitleHelp section='guide/admin/07-idp-integration?id=enabling-an-idp' docsUrl={docsUrl(backendUrl, 'core', 'kwirth')}>
                Configure: {props.connectorLabel}
            </DialogTitleHelp>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    <TextField size='small' fullWidth label='Label' value={instancia.label}
                        onChange={e => setInstancia(prev => ({ ...prev, label: e.target.value }))} />
                    {/* Encendido y apagado sin borrar la configuracion: es lo que permite dejar un IdP
                        preparado y activarlo el dia del corte. */}
                    <FormControlLabel label='Enabled'
                        control={<Switch checked={instancia.enabled} onChange={e => setInstancia(prev => ({ ...prev, enabled: e.target.checked }))} />} />
                    {props.schema.length === 0
                        ? <Typography variant='body2' sx={{
                        color: 'text.secondary'
                    }}>This connector has no configurable options.</Typography>
                        : <ConfigFields schema={props.schema} values={instancia.config} onChange={setCampo} invalidFields={fieldErrors.map(e => e.field)} />}
                    {/* Signup belongs to the core, not to the connector: the same two fields for every IdP. */}
                    <Typography variant='subtitle2' sx={{ pt: 1 }}>Signup</Typography>
                    <FormControlLabel label='Allow signup (people who are not users may request access)'
                        control={<Switch checked={signupEnabled} onChange={e => setSignupEnabled(e.target.checked)} />} />
                    <TextField size='small' fullWidth label='Allowed email domains' placeholder='e.g. example.com, example.org'
                        disabled={!signupEnabled} value={signupDomains} onChange={e => setSignupDomains(e.target.value)}
                        helperText={signupEnabled && parseDomains(signupDomains).length === 0
                            ? 'Empty: anyone with an account at this provider can request access.'
                            : 'Comma-separated. The whole domain must match: subdomains are not included.'} />
                    {error && <Typography variant='caption' color='error'>{error}</Typography>}
                    {fieldErrors.length > 0 && <Typography variant='caption' color='error' data-testid='config-field-errors'>{fieldErrors.map(e => e.message).join('. ')}</Typography>}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button variant='contained' disabled={saving} onClick={guardar}>{saving ? <CircularProgress size={14} /> : 'Save'}</Button>
                <Button onClick={props.onClose}>Cancel</Button>
            </DialogActions>
        </Dialog>
    );
}

export { IdpConfigDialog }
export type { IIdpInstance }
