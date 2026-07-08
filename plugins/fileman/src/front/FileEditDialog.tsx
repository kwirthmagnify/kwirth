import React, { useState } from 'react'
import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, useTheme } from '@mui/material'
import CodeMirror from '@uiw/react-codemirror'
import { yaml } from '@codemirror/lang-yaml'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap } from '@codemirror/commands'
import { search, searchKeymap } from '@codemirror/search'
import { oneDark } from '@codemirror/theme-one-dark'

interface IFileEditDialogProps {
    filename: string
    content: string
    readOnly?: boolean
    onSave: (content: string) => Promise<void>
    onClose: () => void
}

const FileEditDialog: React.FC<IFileEditDialogProps> = (props) => {
    const theme = useTheme()
    const [code, setCode] = useState(props.content)
    const [changed, setChanged] = useState(false)
    const [saving, setSaving] = useState(false)

    const ext = props.filename.split('.').pop()?.toLowerCase()

    const extensions = [
        ...(ext === 'yaml' || ext === 'yml' ? [yaml()] : []),
        search({ top: true }),
        keymap.of([...defaultKeymap, ...searchKeymap]),
        EditorView.theme({
            '&': { height: '100%', fontSize: '12px', fontFamily: "'Fira Code', 'Source Code Pro', monospace" }
        }, { dark: theme.palette.mode === 'dark' })
    ]

    const handleSave = async () => {
        setSaving(true)
        await props.onSave(code)
        setSaving(false)
        setChanged(false)
    }

    const shortName = props.filename.split('/').pop() ?? props.filename

    return (
        <Dialog open fullWidth maxWidth='lg' sx={{ '& .MuiDialog-paper': { height: '85vh' } }}>
            <DialogTitle sx={{ py: 1, fontFamily: 'monospace', fontSize: '0.9rem' }}>
                {props.readOnly ? '(read-only) ' : ''}{shortName}
                <span style={{ fontWeight: 400, opacity: 0.5, marginLeft: 8 }}>{props.filename}</span>
            </DialogTitle>
            <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <CodeMirror
                    value={code}
                    height='100%'
                    readOnly={props.readOnly}
                    theme={theme.palette.mode === 'dark' ? oneDark : 'light'}
                    extensions={extensions}
                    onChange={(val) => { if (!props.readOnly) { setCode(val); setChanged(true) } }}
                    style={{ height: '100%', overflow: 'auto' }}
                />
            </DialogContent>
            <DialogActions>
                <Button variant='outlined' onClick={props.onClose}>{props.readOnly || !changed ? 'Close' : 'Cancel'}</Button>
                {!props.readOnly && (
                    <Button
                        variant='contained'
                        disabled={!changed || saving}
                        onClick={handleSave}
                        startIcon={saving ? <CircularProgress size={14} color='inherit' /> : undefined}
                    >
                        {saving ? 'Saving…' : 'Save'}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    )
}

export { FileEditDialog }
