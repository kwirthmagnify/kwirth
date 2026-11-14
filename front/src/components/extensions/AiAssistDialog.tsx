import React, { useContext, useState } from 'react'
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material'
import { DialogTitleHelp, docsUrl } from '@kwirthmagnify/kwirth-common-front'
import { IConfigAiAssistRequest, IConfigAiAssistResponse } from '@kwirthmagnify/kwirth-common'
import { ILlm } from '@kwirthmagnify/kwirth-common-ai'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { addPostAuthorization } from '../../tools/AuthorizationManagement'

/*
    "Generate with AI" for a configuration field (IConfigFieldDef.aiInstructions; plans/sender-script,
    D10/D11).

    The user picks an LLM and describes what they want; the core drafts the value and it is handed back
    through onGenerated, which puts it in the field WITHOUT saving: the configuration dialog's own Save is
    still the only thing that stores it. The model only writes text — it runs nothing.

    Built on the reference dialog (Excubitor's Home settings): fixed paper, the message on the left of
    the actions — where it is seen, not under the fold — the primary action
    contained and Cancel outlined on the right, and Cancel with something typed asks before discarding it.
*/

/** What /core/aiconfig/assist answers on an error (IConfigAiAssistResponse documents it). */
interface IAiAssistError {
    error?: string
}

interface IAiAssistDialogProps {
    /** The LLMs configured in Kwirth; the dialog is never opened with none. */
    llms: ILlm[]
    /** The request without 'llmId' and 'request', which the user fills in here. */
    base: Omit<IConfigAiAssistRequest, 'llmId' | 'request'>
    fieldLabel: string
    onGenerated: (text: string) => void
    onClose: () => void
}

const AiAssistDialog: React.FC<IAiAssistDialogProps> = (props) => {
    const { accessString, backendUrl } = useContext(SessionContext) as SessionContextType
    const [llmId, setLlmId] = useState<string>(props.llms[0]?.id ?? '')
    const [request, setRequest] = useState('')
    const [working, setWorking] = useState(false)
    const [error, setError] = useState<string>()
    const [confirmDiscard, setConfirmDiscard] = useState(false)

    const generate = async () => {
        setWorking(true)
        setError(undefined)
        try {
            const body: IConfigAiAssistRequest = { ...props.base, llmId, request }
            const res = await fetch(`${backendUrl}/core/aiconfig/assist`, addPostAuthorization(accessString, JSON.stringify(body)))
            const json: unknown = await res.json()
            if (!res.ok) {
                const reason = (json as IAiAssistError).error ?? res.statusText
                setError(res.status === 429
                    ? `The usage limit of this LLM has been reached: ${reason}`
                    : `The LLM could not draft it: ${reason}`)
                return
            }
            props.onGenerated((json as IConfigAiAssistResponse).text)
            props.onClose()
        }
        catch (err) {
            setError(`The LLM could not draft it: ${err instanceof Error ? err.message : String(err)}`)
        }
        finally {
            setWorking(false)
        }
    }

    const cancel = () => request.trim() !== '' ? setConfirmDiscard(true) : props.onClose()

    return (
        <Dialog open onClose={working ? undefined : cancel} slotProps={{
            paper: { sx: { width: 640, maxWidth: '95vw', height: 460, maxHeight: '95vh' } }
        }}>
            <DialogTitleHelp section='guide/extensions/ai-assist' docsUrl={docsUrl(backendUrl, 'core', 'kwirth')}>Generate with AI — {props.fieldLabel}</DialogTitleHelp>
            <DialogContent dividers sx={{ overflowY: 'auto', pt: 2 }}>
                <Stack spacing={2.5}>
                    <FormControl size='small' sx={{ width: 360 }}>
                        <InputLabel>LLM</InputLabel>
                        <Select label='LLM' value={llmId} onChange={e => setLlmId(e.target.value)} disabled={working}>
                            {props.llms.map(l => <MenuItem key={l.id} value={l.id}>{l.id} ({l.provider}/{l.model})</MenuItem>)}
                        </Select>
                    </FormControl>
                    <Box>
                        <TextField label='Describe what you want' fullWidth multiline rows={7} value={request} disabled={working}
                            placeholder='e.g. when an alarm arrives, POST its text to https://hooks.example/alarm'
                            onChange={e => setRequest(e.target.value)} />
                        <Typography variant='caption' sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                            The AI only writes the text: it replaces the field's content, nothing is saved or run. Review it before saving.
                        </Typography>
                    </Box>
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, gap: 1 }}>
                {confirmDiscard
                    ? <>
                        <Typography variant='body2' sx={{ flex: 1 }}>Discard your description?</Typography>
                        <Button onClick={props.onClose} color='error'>Discard</Button>
                        <Button onClick={() => setConfirmDiscard(false)} variant='contained'>Keep editing</Button>
                      </>
                    : <>
                        <Typography variant='body2' sx={{ flex: 1, color: 'error.main' }}>{error ?? ''}</Typography>
                        <Button onClick={generate} variant='contained' disabled={working || llmId === '' || request.trim() === ''}
                            startIcon={working ? <CircularProgress size={16} /> : undefined}>Generate</Button>
                        <Button onClick={cancel} variant='outlined' disabled={working}>Cancel</Button>
                      </>}
            </DialogActions>
        </Dialog>
    )
}

export { AiAssistDialog }
