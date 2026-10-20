import React, { useEffect, useState } from 'react'
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material'

/*
    Managing the Trivy Operator: what the gear of this provider opens.

    It used to be a 'Manage' button inside the Trivy CHANNEL, which was the wrong place twice over: the
    operator is what writes the CRDs this provider reads, so it is the provider's business; and the
    channel had to carry a whole permission ladder just to decide whether to light the button up.

    The core hands this dialog `backendUrl` and `accessString` (see ConfigFrontDialog) and mounts the
    provider's configRouter at '/core/providerconfig/trivy', always behind key validation.
*/
interface IProviderConfigDialogProps {
    onClose: () => void
    backendUrl: string
    accessString: string
}

const ROUTE = '/core/providerconfig/trivy'

interface IOperatorStatus {
    installed: boolean
    detail: string
}

const TrivyOperatorDialog: React.FC<IProviderConfigDialogProps> = (props: IProviderConfigDialogProps) => {
    const [status, setStatus] = useState<IOperatorStatus | undefined>(undefined)
    const [busy, setBusy] = useState<'' | 'install' | 'remove' | 'status'>('status')
    const [error, setError] = useState('')

    const auth = { 'Authorization': 'Bearer ' + props.accessString }

    const readStatus = async () => {
        setBusy('status')
        setError('')
        try {
            const r = await fetch(`${props.backendUrl}${ROUTE}/status`, { headers: auth })
            if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
            setStatus(await r.json() as IOperatorStatus)
        }
        catch (err) {
            setStatus(undefined)
            setError(`Could not read the operator's status: ${err}`)
        }
        finally { setBusy('') }
    }

    /*
        Install and remove are the same call with a different verb, and BOTH re-read the status
        afterwards instead of assuming they worked. Applying a hundred manifests can fail halfway, and a
        dialog that says 'installed' because the button was pressed is worse than one that says nothing.
    */
    const act = async (what: 'install' | 'remove') => {
        setBusy(what)
        setError('')
        try {
            const r = await fetch(`${props.backendUrl}${ROUTE}/${what}`, { method: 'POST', headers: auth })
            if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
        }
        catch (err) {
            setError(`${what === 'install' ? 'Installing' : 'Removing'} the operator failed: ${err}`)
        }
        finally { await readStatus() }
    }

    useEffect(() => { void readStatus() }, [])

    const working = busy !== ''

    return (
        <Dialog open={true} maxWidth='sm' fullWidth>
            <DialogTitle>Trivy Operator</DialogTitle>
            <DialogContent>
                <Stack spacing={2} direction='column' sx={{ mt: 1 }}>
                    <Typography variant='body2' color='text.secondary'>
                        This provider reads the reports the <b>Trivy Operator</b> writes as CRDs in the cluster.
                        Without it there is nothing to read, and the Trivy channel shows an empty screen.
                    </Typography>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography><b>Status:</b></Typography>
                        {busy === 'status'
                            ? <CircularProgress size={16} />
                            : <Typography>{status ? status.detail : 'unknown'}</Typography>}
                    </Box>

                    {error && <Alert severity='error' onClose={() => setError('')}>{error}</Alert>}

                    <Stack direction='row' spacing={1}>
                        <Button variant='outlined' disabled={working || status?.installed === true} onClick={() => act('install')}>
                            {busy === 'install' ? <CircularProgress size={18} /> : 'INSTALL'}
                        </Button>
                        <Button variant='outlined' color='error' disabled={working || status?.installed === false} onClick={() => act('remove')}>
                            {busy === 'remove' ? <CircularProgress size={18} /> : 'REMOVE'}
                        </Button>
                    </Stack>

                    <Typography variant='caption' color='text.secondary'>
                        Installing deploys the operator, its CRDs and its RBAC across the cluster; removing takes
                        them away, and the reports with them.
                    </Typography>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button variant='outlined' disabled={working} onClick={props.onClose}>CLOSE</Button>
            </DialogActions>
        </Dialog>
    )
}

export default TrivyOperatorDialog
