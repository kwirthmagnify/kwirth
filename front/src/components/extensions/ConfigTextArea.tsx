import React, { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Box, IconButton, InputAdornment, TextField, Tooltip, Typography } from '@mui/material'
import { SmartToy, Visibility, VisibilityOff } from '@kwirthmagnify/kwirth-common-front/icons'
import { IConfigAiAssistField, IConfigFieldDef } from '@kwirthmagnify/kwirth-common'
import { ILlm } from '@kwirthmagnify/kwirth-common-ai'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { addGetAuthorization } from '../../tools/AuthorizationManagement'
import { AiAssistDialog } from './AiAssistDialog'
import { applyMaskedEdit, maskText } from '../../tools/maskedText'

/*
    A 'textarea' configuration field (IConfigFieldDef), shared by the two renderers of the configuration
    forms — ConfigFields (single configuration) and ConfigListDialog (named configurations: senders,
    webhooks) — so that both draw it the same way.

      · Multi-line, monospaced, FIXED height: the content scrolls inside and the dialog never grows.
      · 'secret': masked behind an eye. A multi-line field has no type='password', so while hidden it shows
        one dot per character keeping the line breaks — and stays EDITABLE, like a password field: what is
        typed or pasted over the dots lands at that place of the real value and is masked at once
        (tools/maskedText). The eye reveals it. The value is real, as every secret in Kwirth.
      · 'aiInstructions': an AI button, ALWAYS visible and disabled (with the reason) when Kwirth has no
        LLM configured. What it drafts replaces the content without saving.
*/

const ROWS = 8

// A configuration is whatever its schema says: the core does not know each extension's fields.
type TFormValues = Record<string, unknown>

interface IConfigTextAreaProps {
    field: IConfigFieldDef
    value: string
    onChange: (value: string) => void
    /** The whole form, so the AI gets the other fields (never the secret ones) as context. */
    fields: IConfigFieldDef[]
    values: TFormValues
    /** Greyed out by IConfigFieldDef.enabledWhen: shown, not editable, and the AI button off with it. */
    disabled?: boolean
    /** Refused by the back end when saving (ConfigFields' invalidFields): drawn in error. */
    error?: boolean
}

const isSecretDef = (f: IConfigFieldDef): boolean => f.type === 'password' || f.secret === true

/** The form as the AI assistant sees it: no password, no secret. */
const assistFields = (fields: IConfigFieldDef[], values: TFormValues): IConfigAiAssistField[] =>
    fields.filter(f => !isSecretDef(f)).map(f => {
        const v = values[f.name]
        const value = typeof v === 'number' || typeof v === 'boolean' ? v : String(v ?? '')
        return { name: f.name, label: f.label, type: f.type, secret: f.secret, value }
    })

const ConfigTextArea: React.FC<IConfigTextAreaProps> = (props) => {
    const { accessString, backendUrl } = useContext(SessionContext) as SessionContextType
    const f = props.field
    const [revealed, setRevealed] = useState(false)
    const [llms, setLlms] = useState<ILlm[]>([])
    const [assistOpen, setAssistOpen] = useState(false)

    useEffect(() => {
        if (!f.aiInstructions) return
        fetch(`${backendUrl}/core/aiconfig/llms`, addGetAuthorization(accessString))
            .then(r => r.ok ? r.json() as Promise<ILlm[]> : [])
            .then(list => setLlms(Array.isArray(list) ? list : []))
            .catch(() => setLlms([]))
    }, [backendUrl, accessString, f.aiInstructions])

    const masked = f.secret === true && !revealed
    const shown = masked ? maskText(props.value) : props.value

    // Re-masking what was just typed rewrites the textarea, which would throw the caret to the end: put it back.
    const inputRef = useRef<HTMLTextAreaElement | null>(null)
    const caretRef = useRef<number | null>(null)
    useLayoutEffect(() => {
        if (caretRef.current === null || !inputRef.current) return
        inputRef.current.setSelectionRange(caretRef.current, caretRef.current)
        caretRef.current = null
    }, [shown])
    const edit = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const typed = e.target.value
        if (!masked) {
            props.onChange(typed)
            return
        }
        const caret = e.target.selectionEnd ?? typed.length
        caretRef.current = caret
        props.onChange(applyMaskedEdit(props.value, shown, typed, caret))
    }

    const label = `${f.label}${f.required ? ' *' : ''}`
    const eye = f.secret ? (
        <IconButton size='small' aria-label={revealed ? 'Hide' : 'Show'} onClick={() => setRevealed(!revealed)}>
            {revealed ? <VisibilityOff fontSize='small' /> : <Visibility fontSize='small' />}
        </IconButton>
    ) : undefined
    const htmlInput = { 'aria-label': f.label, spellCheck: false, autoComplete: 'off', style: { fontFamily: 'monospace', fontSize: '0.85rem', whiteSpace: 'pre', overflowX: 'auto' } }

    /*
        A field the AI can draft carries its title ABOVE it, with the AI button beside the title: inside a
        multi-line box the button sat over the text and looked out of place. Every other textarea keeps
        the form's usual floating label — and a secret one its eye inside, like any password.
    */
    if (f.aiInstructions) {
        return (
            <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5, minHeight: 30 }}>
                    <Typography variant='body2' color={props.disabled ? 'text.disabled' : undefined}>{label}</Typography>
                    <Tooltip title={llms.length === 0 ? 'No LLM is configured in Kwirth' : 'Generate with AI'}>
                        <span>
                            <IconButton size='small' aria-label='Generate with AI' disabled={llms.length === 0 || props.disabled} onClick={() => setAssistOpen(true)}>
                                <SmartToy fontSize='small' />
                            </IconButton>
                        </span>
                    </Tooltip>
                    {eye}
                </Box>
                <TextField size='small' fullWidth multiline rows={ROWS} value={shown} disabled={props.disabled} error={props.error}
                    onChange={edit} inputRef={inputRef}
                    slotProps={{ htmlInput }} />
                {assistOpen && (
                    <AiAssistDialog llms={llms} fieldLabel={f.label}
                        base={{ fieldName: f.name, aiInstructions: f.aiInstructions, fields: assistFields(props.fields, props.values) }}
                        onGenerated={text => props.onChange(text)}
                        onClose={() => setAssistOpen(false)} />
                )}
            </Box>
        )
    }

    return (
        <TextField size='small' fullWidth multiline rows={ROWS} label={label} value={shown} disabled={props.disabled} error={props.error}
            onChange={edit} inputRef={inputRef}
            slotProps={{
                input: { endAdornment: eye ? <InputAdornment position='end' sx={{ alignSelf: 'flex-start', mt: 1.5 }}>{eye}</InputAdornment> : undefined },
                htmlInput
            }} />
    )
}

export { ConfigTextArea }
