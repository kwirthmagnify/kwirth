import React from 'react'
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItem, ListItemText, Typography } from '@mui/material'
import { ICensorSession } from './CensorConfig'

interface CensorSessionPickerProps {
    sessions: ICensorSession[]
    connectedSessionId: string | null
    ephemeralSessionName: string | null
    onConnect: (sessionId: string) => void
    onStart: (sessionId: string) => void
    onStop: (sessionId: string) => void
    onDelete: (sessionId: string) => void
    onDisconnect: () => void
    onClose: () => void
}

export const CensorSessionPicker: React.FC<CensorSessionPickerProps> = ({
    sessions, connectedSessionId, ephemeralSessionName, onConnect, onStart, onStop, onDelete, onDisconnect, onClose
}) => {
    return (
        <Dialog open={true} PaperProps={{ sx: { width: 500, height: 420 } }}>
            <DialogTitle>Sessions</DialogTitle>
            <DialogContent sx={{ p: 1, display: 'flex', flexDirection: 'column' }}>
                {sessions.length === 0
                    ? <Typography variant='caption' color='text.secondary' sx={{ p: 1, display: 'block' }}>
                        No active sessions. Start one from the Config dialog.
                    </Typography>
                    : <List dense sx={{ py: 0 }}>
                        {sessions.map(s => (
                            <ListItem key={s.id} disableGutters sx={{ px: 0.5, borderBottom: 1, borderColor: 'divider' }}
                                secondaryAction={
                                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                                        {connectedSessionId === s.id
                                            ? <Button size='small' variant='outlined' onClick={onDisconnect}>Disconnect</Button>
                                            : <Button size='small' variant='outlined' disabled={s.description === ephemeralSessionName} onClick={() => onConnect(s.id)}>Connect</Button>
                                        }
                                        {s.analyzing
                                            ? <Button size='small' variant='outlined' color='warning' onClick={() => onStop(s.id)}>Stop</Button>
                                            : <Button size='small' variant='outlined' color='success' onClick={() => onStart(s.id)}>Start</Button>
                                        }
                                        <Button size='small' color='error' disabled={s.description === ephemeralSessionName} onClick={() => onDelete(s.id)}>Delete</Button>
                                    </Box>
                                }>
                                <ListItemText
                                    primary={<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Typography variant='body2' sx={{ fontSize: 13 }}>{s.description}</Typography>
                                        {connectedSessionId === s.id && (
                                            <Chip label='connected' size='small' color='success' sx={{ height: 18, fontSize: '10px' }} />
                                        )}
                                        {s.analyzing && (
                                            <Chip label='analyzing' size='small' color='primary' sx={{ height: 18, fontSize: '10px' }} />
                                        )}
                                    </Box>}
                                    secondary={`${s.namespace}${s.group ? ` › ${s.group}` : s.pod ? ` › ${s.pod}` : ''}`}
                                    secondaryTypographyProps={{ variant: 'caption' }} />
                            </ListItem>
                        ))}
                    </List>
                }
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} color='inherit'>Close</Button>
            </DialogActions>
        </Dialog>
    )
}
