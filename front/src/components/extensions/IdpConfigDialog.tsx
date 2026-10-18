import React, { useContext, useState } from 'react'
import { Button, CircularProgress, Dialog, DialogActions, DialogContent, FormControlLabel, Stack, Switch, TextField, Typography } from '@mui/material'
import { DialogTitleHelp, docsUrl } from '@kwirthmagnify/kwirth-common-front'
import { IConfigFieldDef } from '@kwirthmagnify/kwirth-common'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { addGetAuthorization, addPostAuthorization, addPutAuthorization } from '../../tools/AuthorizationManagement'
import { ConfigFields } from './ConfigFields'

/*
    An identity provider's configuration: a connector's INSTANCE.

    A connector (google, entra, github…) is what gets installed; the instance is that connector already
    configured and switched on. There is ONE per connector —its id is the connector's— so even though
    they are two entities in the back end, on the screen they behave like an extension and its
    configuration.

    ⚠️ Secrets do not arrive with the rest: the list gives them masked and the REAL value is only asked
    for on pressing the eye, against /core/idps/export, which is admin-only. That way a secret does not travel
    to anybody's browser until it has to be shown.
*/

interface IIdpInstance {
    id: string
    connectorId: string
    label: string
    enabled: boolean
    config: Record<string, unknown>
}

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

    const setCampo = (name: string, value: unknown) =>
        setInstancia(prev => ({ ...prev, config: { ...prev.config, [name]: value } }))

    /*
        Revealing a secret fetches its REAL value from the export (admin-only): what is in the form comes
        masked from the list, and saving the mask would leave the configuration broken without warning.
    */
    const revelarSecreto = async (name: string) => {
        // Nothing is stored yet, so what is in the field IS the real value.
        if (esNueva) return
        try {
            const res = await fetch(`${backendUrl}/core/idps/export`, addGetAuthorization(accessString))
            if (res.ok) {
                const todo = await res.json()
                const real = todo?.[instancia.id]?.config?.[name]
                if (real !== undefined) setCampo(name, real)
            }
        }
        catch { /* si el export falla se enseña lo que haya en el campo */ }
    }

    const guardar = async () => {
        setSaving(true)
        setError(undefined)
        try {
            const res = esNueva
                ? await fetch(`${backendUrl}/core/idps/instances`, addPostAuthorization(accessString, JSON.stringify(instancia)))
                : await fetch(`${backendUrl}/core/idps/instances/${instancia.id}`, addPutAuthorization(accessString, JSON.stringify(instancia)))
            if (!res.ok) {
                const detalle = await res.json().catch(() => ({}))
                throw new Error(detalle.error ?? `HTTP ${res.status}`)
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
                        ? <Typography variant='body2' color='text.secondary'>This connector has no configurable options.</Typography>
                        : <ConfigFields schema={props.schema} values={instancia.config} onChange={setCampo} onRevealSecret={revelarSecreto} />}
                    {error && <Typography variant='caption' color='error'>{error}</Typography>}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button variant='contained' disabled={saving} onClick={guardar}>{saving ? <CircularProgress size={14} /> : 'Save'}</Button>
                <Button onClick={props.onClose}>Cancel</Button>
            </DialogActions>
        </Dialog>
    )
}

export { IdpConfigDialog }
export type { IIdpInstance }
