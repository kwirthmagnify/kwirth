import React, { useContext, useState } from 'react'
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, IconButton, InputAdornment, Stack, TextField, Typography } from '@mui/material'
import { Visibility, VisibilityOff } from '@kwirthmagnify/kwirth-common-front/icons'
import { DialogTitleHelp, docsUrl } from '@kwirthmagnify/kwirth-common-front'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { Cluster } from '../../model/Cluster'
import { loginToCluster } from '../../tools/ClusterLogin'
import { EClusterLoginOutcome } from '../../tools/ClusterLoginOutcome'
import { useEscapeToClose } from '../../tools/useKeyboard'

/*
    Sign in to a REMOTE Kwirth from an entry of the cluster list whose credentials are LOGIN
    (plan: plans/cluster-login/PRD.md).

    The user and password are the remote's, not this Kwirth's: logged in here as 'admin', the remote may be entered
    as any of its users. That is also why the browser must NOT fill the fields in: it is the same domain as this
    Kwirth, and it would offer this Kwirth's own credentials. 'off' on the user and 'new-password' on the password —
    browsers ignore 'off' on password fields.

    It only signs in and keeps the key (D4): a remote that asks for a password change, or an SSO user, is told
    what to do, and nothing else is done here. The content has a fixed size: the reason, the fields and the error
    line are always there, so the dialog never jumps.
*/

/** Why the dialog is open: the entry has no key yet, or the remote refused the one it had (D5). */
export enum EClusterLoginReason {
    NO_SESSION = 'nosession',
    EXPIRED = 'expired'
}

interface IClusterLoginDialogProps {
    cluster: Cluster
    reason: EClusterLoginReason
    /** Called after a successful sign-in, with the entry already holding the key. */
    onSignedIn: (cluster: Cluster) => void
    onCancel: () => void
}

const ClusterLoginDialog: React.FC<IClusterLoginDialogProps> = (props: IClusterLoginDialogProps) => {
    const { backendUrl } = useContext(SessionContext) as SessionContextType
    const [user, setUser] = useState<string>(props.cluster.remoteUser ?? '')
    const [password, setPassword] = useState<string>('')
    const [revealed, setRevealed] = useState<boolean>(false)
    const [busy, setBusy] = useState<boolean>(false)
    const [error, setError] = useState<string>('')
    const escapeRef = useEscapeToClose(props.onCancel)

    const canSignIn = user.trim() !== '' && password !== '' && !busy

    const signIn = async () => {
        if (!canSignIn) return
        setBusy(true)
        setError('')
        const result = await loginToCluster(props.cluster, user.trim(), password)
        setBusy(false)
        if (result.outcome === EClusterLoginOutcome.OK) {
            props.onSignedIn(props.cluster)
            return
        }
        // the password is cleared after a failure, the user is not: it is the part usually right
        setPassword('')
        setError(result.message)
    }

    const reasonText = props.reason === EClusterLoginReason.EXPIRED
        ? 'Your session in this cluster has expired. Sign in again to keep using it.'
        : 'This cluster signs in with a user of its own Kwirth. It can be a different user from the one you are using here.'

    return (
        <Dialog open={true} ref={escapeRef} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: 480 } }}>
            <DialogTitleHelp section='guide/admin/06-cluster-management?id=signing-in-to-a-cluster' docsUrl={docsUrl(backendUrl, 'core', 'kwirth')}>
                Sign in to {props.cluster.name}
            </DialogTitleHelp>
            <DialogContent>
                <Stack spacing={2} sx={{ height: 260, pt: 1 }}>
                    <Typography variant='caption' sx={{ color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={props.cluster.url}>
                        {props.cluster.url}
                    </Typography>
                    <Alert severity={props.reason === EClusterLoginReason.EXPIRED ? 'warning' : 'info'} data-testid='cluster-login-reason' sx={{ py: 0 }}>
                        {reasonText}
                    </Alert>
                    <TextField label='User' variant='standard' value={user} autoFocus={user === ''}
                        onChange={e => setUser(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') signIn() }}
                        slotProps={{ htmlInput: { autoComplete: 'off', 'aria-label': 'Remote user' } }} />
                    <TextField label='Password' variant='standard' value={password} autoFocus={user !== ''}
                        type={revealed ? 'text' : 'password'}
                        onChange={e => setPassword(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') signIn() }}
                        slotProps={{
                            htmlInput: { autoComplete: 'new-password', 'aria-label': 'Remote password' },
                            input: {
                                endAdornment: (
                                    <InputAdornment position='end'>
                                        <IconButton size='small' aria-label={revealed ? 'Hide password' : 'Show password'} onClick={() => setRevealed(r => !r)}>
                                            {revealed ? <VisibilityOff fontSize='small' /> : <Visibility fontSize='small' />}
                                        </IconButton>
                                    </InputAdornment>
                                )
                            }
                        }} />
                </Stack>
            </DialogContent>
            {/* The error goes between the content and the buttons, always there (empty when there is none): it
                is read right where the user just pressed, and the dialog does not grow when it appears. */}
            <Box sx={{ px: 3, minHeight: 40 }}>
                <Typography variant='caption' color='error' data-testid='cluster-login-error'>{error}</Typography>
            </Box>
            <DialogActions>
                <Button variant='contained' onClick={signIn} disabled={!canSignIn} startIcon={busy ? <CircularProgress size={14} /> : undefined}>SIGN IN</Button>
                <Button variant='outlined' onClick={props.onCancel}>CANCEL</Button>
            </DialogActions>
        </Dialog>
    )
}

export { ClusterLoginDialog }
