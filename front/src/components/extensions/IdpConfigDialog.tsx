import React, { useContext, useState } from 'react'
import { Button, CircularProgress, Dialog, DialogActions, DialogContent, FormControlLabel, IconButton, Stack, Switch, TextField, Typography } from '@mui/material'
import { Visibility, VisibilityOff } from '@kwirthmagnify/kwirth-common-front/icons'
import { DialogTitleHelp, docsUrl } from '@kwirthmagnify/kwirth-common-front'
import { IConfigFieldDef } from '@kwirthmagnify/kwirth-common'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { addGetAuthorization, addPostAuthorization, addPutAuthorization } from '../../tools/AuthorizationManagement'

/*
    La configuracion de un identity provider: la INSTANCIA de un conector.

    Un conector (google, entra, github…) es lo que se instala; la instancia es ese conector ya configurado
    y encendido. Hay UNA por conector —su id es el del conector—, asi que aunque sean dos entidades en el
    back, en la pantalla se comportan como una extension con su configuracion.

    ⚠️ Los secretos no llegan con el resto: la lista los da enmascarados y el valor REAL solo se pide al
    pulsar el ojo, contra /idp/export, que es admin-only. Asi un secreto no viaja al navegador de nadie
    mientras no haga falta enseñarlo.
*/

interface IIdpInstance {
    id: string
    connectorId: string
    label: string
    enabled: boolean
    config: Record<string, unknown>
}

interface IIdpConfigDialogProps {
    /** El conector al que pertenece: de el salen el nombre y los campos del formulario. */
    connectorId: string
    connectorLabel: string
    schema: IConfigFieldDef[]
    /** La instancia guardada, si ya existe. Sin ella se esta creando. */
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
        Al revelar un secreto se trae su valor REAL del export (admin-only): lo que hay en el formulario
        viene enmascarado de la lista, y guardar la mascara dejaria la configuracion rota sin avisar.
    */
    const alternarSecreto = async (name: string) => {
        if (revelados[name]) {
            setRevelados(prev => ({ ...prev, [name]: false }))
            return
        }
        if (!esNueva) {
            try {
                const res = await fetch(`${backendUrl}/idp/export`, addGetAuthorization(accessString))
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
                ? await fetch(`${backendUrl}/idp`, addPostAuthorization(accessString, JSON.stringify(instancia)))
                : await fetch(`${backendUrl}/idp/${instancia.id}`, addPutAuthorization(accessString, JSON.stringify(instancia)))
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
                    // Sin esto el navegador rellena 'tenant' y 'secret' con el usuario y la contraseña
                    // con los que se entro a Kwirth.
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
