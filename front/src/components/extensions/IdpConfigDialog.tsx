import React, { useContext, useState } from 'react'
import { Button, CircularProgress, Dialog, DialogActions, DialogContent, FormControlLabel, IconButton, Stack, Switch, TextField, Typography } from '@mui/material'
import { Visibility, VisibilityOff } from '@kwirthmagnify/kwirth-common-front/icons'
import { DialogTitleHelp, docsUrl } from '@kwirthmagnify/kwirth-common-front'
import { IConfigFieldDef } from '@kwirthmagnify/kwirth-common'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { addGetAuthorization, addPostAuthorization, addPutAuthorization } from '../../tools/AuthorizationManagement'

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
    const [instancia, setInstancia] = useState<IIdpInstance>(props.existing
        ? { ...props.existing, config: { ...props.existing.config } }
        : { id: props.connectorId, connectorId: props.connectorId, label: props.connectorLabel, enabled: false, config: {} })
    const [revelados, setRevelados] = useState<Record<string, boolean>>({})
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | undefined>()

    const setCampo = (name: string, value: unknown) =>
        setInstancia(prev => ({ ...prev, config: { ...prev.config, [name]: value } }))

    /*
        Revealing a secret fetches its REAL value from the export (admin-only): what is in the form comes
        masked from the list, and saving the mask would leave the configuration broken without warning.
    */
    const alternarSecreto = async (name: string) => {
        if (revelados[name]) {
            setRevelados(prev => ({ ...prev, [name]: false }))
            return
        }
        if (!esNueva) {
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
        setRevelados(prev => ({ ...prev, [name]: true }))
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

    const campo = (f: IConfigFieldDef) => {
        const valor = instancia.config[f.name]
        if (f.type === 'boolean') {
            return <FormControlLabel key={f.name} label={f.label}
                control={<Switch checked={Boolean(valor)} onChange={e => setCampo(f.name, e.target.checked)} />} />
        }

        const esSecreto = f.type === 'password'
        const visible = revelados[f.name]
        return (
            <TextField key={f.name} size='small' fullWidth label={f.label} required={f.required}
                type={f.type === 'number' ? 'number' : (esSecreto && !visible) ? 'password' : 'text'}
                value={valor ?? ''}
                onChange={e => setCampo(f.name, f.type === 'number' ? Number(e.target.value) : e.target.value)}
                slotProps={{
                    // Without this the browser fills 'tenant' and 'secret' with the username and password
                    // Kwirth was logged into with.
                    htmlInput: { autoComplete: esSecreto ? 'new-password' : 'off' },
                    ...(esSecreto ? { input: {
                        endAdornment: (
                            <IconButton size='small' edge='end' aria-label={visible ? 'Hide' : 'Show'} onClick={() => alternarSecreto(f.name)} title={visible ? 'Hide' : 'Show'}>
                                {visible ? <VisibilityOff fontSize='small' /> : <Visibility fontSize='small' />}
                            </IconButton>
                        )
                    } } : {})
                }} />
        )
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
                        : props.schema.map(f => campo(f))}
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
