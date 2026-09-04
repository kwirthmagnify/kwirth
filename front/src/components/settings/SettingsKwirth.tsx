import React, { useState, useEffect, useContext } from 'react'
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, Stack, TextField, Typography } from '@mui/material'
import { DialogTitleHelp } from '@kwirthmagnify/kwirth-common-front'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { IKwirthSettings } from '../../model/KwirthSettings'
import { addGetAuthorization, addPutAuthorization } from '../../tools/AuthorizationManagement'

interface ISettingsKwirthProps {
    onClose:(settings?:IKwirthSettings) => void
    clusterName?: string
    clusterUrl: string
    accessString: string
}

const SettingsKwirth: React.FC<ISettingsKwirthProps> = (props:ISettingsKwirthProps) => {
    const [metricsInterval, setMetricsInterval] = useState<number>(0)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const { backendUrl } = useContext(SessionContext) as SessionContextType

    // el dialogo se busca sus propios datos: pide a Kwirth los valores efectivos que rigen ahora mismo
    useEffect(() => {
        const load = async () => {
            try {
                const response = await fetch(`${props.clusterUrl}/core/settings`, addGetAuthorization(props.accessString))
                if (!response.ok) {
                    setError(response.status === 403 ? 'You need the admin scope to manage Kwirth settings.' : `Could not read settings (${response.status}).`)
                    return
                }
                const settings = await response.json() as IKwirthSettings
                setMetricsInterval(settings.metricsInterval ?? 0)
            }
            catch {
                setError('Could not reach Kwirth to read its settings.')
            }
            finally {
                setLoading(false)
            }
        }
        load()
    }, [props.clusterUrl, props.accessString])

    const ok = async () => {
        setError('')
        try {
            const payload = JSON.stringify({ metricsInterval } as IKwirthSettings)
            const response = await fetch(`${props.clusterUrl}/core/settings`, addPutAuthorization(props.accessString, payload))
            if (!response.ok) {
                setError(response.status === 403 ? 'You need the admin scope to manage Kwirth settings.' : `Could not save settings (${response.status}).`)
                return
            }
            props.onClose(await response.json() as IKwirthSettings)
        }
        catch {
            setError('Could not reach Kwirth to save its settings.')
        }
    }

    return (<>
        <Dialog open={true} fullWidth maxWidth='xs' disableRestoreFocus={true}>
            <DialogTitleHelp section='guide/admin/02-initial-config?id=kwirth-settings' docsUrl={backendUrl + '/core/docs/core/kwirth'}>Kwirth settings</DialogTitleHelp>
            <DialogContent>
                <Stack spacing={2} direction='column' sx={{ mt: 1 }}>
                    <Typography variant='body2'>Enter Kwirth configuration for cluster <b>{props.clusterName}</b>. These settings are stored by Kwirth and survive a restart.</Typography>
                    <TextField value={metricsInterval} onChange={(e) => setMetricsInterval(+e.target.value)} variant='standard' label='Cluster metrics read interval (seconds)' type='number' disabled={loading || error!==''} />
                    { loading && <Stack direction='row' spacing={1} alignItems='center'><CircularProgress size={16} /><Typography variant='body2'>Reading current settings...</Typography></Stack> }
                    { error!=='' && <Alert severity='error'>{error}</Alert> }
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button variant='outlined' onClick={ok} disabled={loading || error!=='' || metricsInterval<=0}>OK</Button>
                <Button variant='outlined' onClick={() => props.onClose(undefined)}>Cancel</Button>
            </DialogActions>
        </Dialog>
    </>)
}

export { SettingsKwirth }
