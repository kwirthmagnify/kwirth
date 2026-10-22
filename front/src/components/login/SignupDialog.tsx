import React, { useEffect, useState } from 'react'
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material'
import { ESsoResult, ISignupInfo, ISignupReply, ISignupSubmit } from '@kwirthmagnify/kwirth-common'
import { addPostAuthorization } from '../../tools/AuthorizationManagement'

/*
    Asking for access (plan: plans/completed/signup, S3). The IdP callback lands here with `?signup=<code>` when the
    person is not a Kwirth user and the IdP lets them ask. The code stands for the identity the IdP
    verified: the email is shown, never typed, and the back end takes it from the code, not from here.

    The code lasts a minute and is spent by the submit, so every way out of this dialog ends it: what
    happened is reported by the caller, which owns the login screen's messages.
*/

const NAME_MAX = 100
const COMMENT_MAX = 500

interface ISignupDialogProps {
    backendUrl: string
    code: string
    onSent: () => void
    onRefused: (result?: ESsoResult) => void   // the back end said no; the result says why, when it can
    onExpired: () => void                        // the code is gone (spent, or older than a minute)
    onCancel: () => void
}

const SignupDialog: React.FC<ISignupDialogProps> = (props: ISignupDialogProps) => {
    const [info, setInfo] = useState<ISignupInfo | undefined>(undefined)
    const [name, setName] = useState<string>('')
    const [comment, setComment] = useState<string>('')
    const [sending, setSending] = useState<boolean>(false)
    const [error, setError] = useState<string>('')

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`${props.backendUrl}/core/auth/signup/info`, addPostAuthorization('', JSON.stringify({ code: props.code })))
                if (res.status !== 200) {
                    props.onExpired()
                    return
                }
                const got = await res.json() as ISignupInfo
                setInfo(got)
                setName(got.name)
            }
            catch {
                props.onExpired()
            }
        })()
    }, [])

    const send = async () => {
        setSending(true)
        setError('')
        try {
            const body: ISignupSubmit = { code: props.code, name: name.trim(), comment: comment.trim() || undefined }
            const res = await fetch(`${props.backendUrl}/core/auth/signup`, addPostAuthorization('', JSON.stringify(body)))
            switch (res.status) {
                case 200:
                    props.onSent()
                    return
                case 404:
                    props.onExpired()
                    return
                case 409:
                    props.onRefused(((await res.json().catch(() => ({}))) as ISignupReply).result)
                    return
                default:
                    setError(`The request could not be sent (HTTP ${res.status}).`)
            }
        }
        catch (err) {
            setError(`Error contacting Kwirth: ${err}`)
        }
        finally {
            setSending(false)
        }
    }

    const nameValid = name.trim() !== '' && name.trim().length <= NAME_MAX

    return (
        /*
            The dialog takes the size of its content, and the content never changes shape: the same fields
            are there while the info loads (empty and disabled) and once it has arrived.
        */
        <Dialog open={true} maxWidth={false} PaperProps={{ sx: { width: 560 } }} data-testid='signup-dialog'>
            {/* no help button: whoever asks is not a user yet, and the guide is the admin's */}
            <DialogTitle>Request access</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2}>
                    <Typography variant='body2'>
                        You signed in with <b>{info?.idpLabel ?? 'your identity provider'}</b>, but this account does not have access to Kwirth yet. You can ask an administrator for it: until they approve the request you will not be able to sign in.
                    </Typography>
                    <TextField size='small' fullWidth label='Email' value={info?.id ?? ''} disabled />
                    <TextField size='small' fullWidth label='Name' value={name} onChange={e => setName(e.target.value)} required disabled={!info}
                        error={name.trim().length > NAME_MAX} helperText={`${name.trim().length}/${NAME_MAX}`} />
                    <TextField size='small' fullWidth multiline rows={4} label='Why do you need access? (optional)' value={comment} disabled={!info}
                        onChange={e => setComment(e.target.value)} error={comment.trim().length > COMMENT_MAX} helperText={`${comment.trim().length}/${COMMENT_MAX}`} />
                </Stack>
            </DialogContent>
            {error !== '' && <Alert severity='error' sx={{ mx: 3, mb: 1 }}>{error}</Alert>}
            <DialogActions sx={{ px: 3, gap: 1 }}>
                <Button variant='contained' onClick={send} disabled={!info || sending || !nameValid || comment.trim().length > COMMENT_MAX}>
                    {sending ? <CircularProgress size={14} /> : 'Request access'}
                </Button>
                <Button variant='outlined' onClick={props.onCancel}>Cancel</Button>
            </DialogActions>
        </Dialog>
    )
}

export { SignupDialog }
