import React, { useState } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material'

interface CensorSessionStartProps {
    onConfirm: (description: string) => void
    onClose: () => void
}

export const CensorSessionStart: React.FC<CensorSessionStartProps> = ({ onConfirm, onClose }) => {
    const [description, setDescription] = useState('')

    const handleConfirm = () => {
        const trimmed = description.trim()
        if (trimmed) onConfirm(trimmed)
    }

    return (
        <Dialog open={true} PaperProps={{ sx: { width: 420 } }}>
            <DialogTitle>Launch session</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 1 }}>
                <Alert severity='warning' sx={{ fontSize: '0.8rem' }}>
                    New session will be launched to daemon and will start processing immediately.
                </Alert>
                <TextField
                    autoFocus
                    label='Session description'
                    size='small'
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleConfirm() }}
                    fullWidth
                    placeholder='E.g. "Production monitoring"'
                />
            </DialogContent>
            <DialogActions>
                <Button variant='contained' onClick={handleConfirm} disabled={!description.trim()}>Launch</Button>
                <Button onClick={onClose} color='inherit'>Cancel</Button>
            </DialogActions>
        </Dialog>
    )
}
