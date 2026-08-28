import React, { useEffect, useRef, useState } from 'react'
import { Avatar, Badge, Box, Chip, Divider, IconButton, List, ListItemButton, ListItemText, Stack, TextField, Typography } from '@mui/material'
import { IContentProps } from '@kwirthmagnify/kwirth-common-front'
import Check from '@mui/icons-material/Check'
import DeleteSweep from '@mui/icons-material/DeleteSweep'
import DoneAll from '@mui/icons-material/DoneAll'
import Schedule from '@mui/icons-material/Schedule'
import Send from '@mui/icons-material/Send'
import { IMircData } from './MircData'
import { IUiMessage } from './MircClient'

const fmtTime = (iso: string): string => {
    try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}

const Ticks: React.FC<{ m: IUiMessage }> = ({ m }) => {
    if (!m.mine) return null
    if (m.pending) return <Schedule sx={{ fontSize: 14, ml: 0.5, opacity: 0.6 }} />
    if (m.state === 'read') return <DoneAll sx={{ fontSize: 14, ml: 0.5, color: '#34b7f1' }} />
    if (m.state === 'delivered') return <DoneAll sx={{ fontSize: 14, ml: 0.5, opacity: 0.6 }} />
    return <Check sx={{ fontSize: 14, ml: 0.5, opacity: 0.6 }} />
}

export const MircTabContent: React.FC<IContentProps> = (props: IContentProps) => {
    const data: IMircData = props.channelObject.data
    const client = data.client
    const [, setTick] = useState(0)
    const [draft, setDraft] = useState('')
    const endRef = useRef<HTMLDivElement | null>(null)
    const containerRef = useRef<HTMLDivElement | null>(null)
    const [containerTop, setContainerTop] = useState(0)

    useEffect(() => {
        if (!client) return
        const refresh = () => setTick(t => t + 1)
        client.onChange(refresh)
        refresh()
    }, [client])

    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) })
    useEffect(() => { if (containerRef.current) setContainerTop(containerRef.current.getBoundingClientRect().top) })

    const selectedClusterId = (client && data.selectedClusterName) ? client.clusterIdByName(data.selectedClusterName) : undefined
    const conversation: IUiMessage[] = (client && selectedClusterId && data.selectedPeer)
        ? client.getConversation(selectedClusterId, data.selectedPeer) : []
    const lastIncomingMsgId = conversation.filter(m => !m.mine).at(-1)?.msgId ?? ''
    useEffect(() => {
        if (!client || !lastIncomingMsgId || !selectedClusterId || !data.selectedPeer) return
        client.markRead(selectedClusterId, data.selectedPeer)
    }, [lastIncomingMsgId])

    if (!client || !data.started) {
        return <Box sx={{ p: 2 }}><Typography color='text.secondary'>mIRC not started. Set a nick and start the channel.</Typography></Box>
    }

    const roster = client.getRoster()

    const selectPeer = (nick: string, clusterName: string) => {
        data.selectedPeer = nick
        data.selectedClusterName = clusterName
        const cid = client.clusterIdByName(clusterName)
        if (cid) client.markRead(cid, nick)
        setTick(t => t + 1)
    }

    const sendDraft = () => {
        const body = draft.trim()
        if (!body || !selectedClusterId || !data.selectedPeer) return
        client.send(selectedClusterId, data.selectedPeer, body)
        setDraft('')
    }

    return (
        <Box ref={containerRef} sx={{ display: 'flex', height: `calc(100vh - ${containerTop}px - 8px)`, m: 1, border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
            {/* Roster */}
            <Box sx={{ width: 260, borderRight: 1, borderColor: 'divider', overflowY: 'auto' }}>
                <Typography variant='subtitle2' sx={{ p: 1.5, pb: 0.5 }}>Users</Typography>
                <List dense>
                    {roster.length === 0 && <Typography variant='caption' color='text.secondary' sx={{ pl: 2 }}>No users yet</Typography>}
                    {roster.map(u => {
                        const selected = u.nick === data.selectedPeer && u.cluster === data.selectedClusterName
                        return (
                            <ListItemButton key={`${u.cluster}:${u.nick}`} selected={selected} onClick={() => selectPeer(u.nick, u.cluster || '')}>
                                <Badge variant='dot' overlap='circular' anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                                    sx={{ '& .MuiBadge-dot': { backgroundColor: u.online ? '#44b700' : '#bdbdbd' } }}>
                                    <Avatar sx={{ width: 28, height: 28, fontSize: 14 }}>{u.nick.slice(0, 1).toUpperCase()}</Avatar>
                                </Badge>
                                <ListItemText sx={{ ml: 1.5 }}
                                    primary={u.nick}
                                    secondaryTypographyProps={{ component: 'span' }}
                                    secondary={<Chip label={u.cluster} size='small' variant='outlined' sx={{ fontSize: '0.6rem', height: 16 }} />} />
                            </ListItemButton>
                        )
                    })}
                </List>
            </Box>

            {/* Conversation */}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                {!data.selectedPeer
                    ? <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography color='text.secondary'>Pick someone to start chatting</Typography>
                    </Box>
                    : <>
                        <Stack direction='row' alignItems='center' spacing={1} sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                            <Typography variant='subtitle1'>{data.selectedPeer}</Typography>
                            <Chip label={data.selectedClusterName} size='small' variant='outlined' sx={{ fontSize: '0.6rem', height: 16 }} />
                            <Box sx={{ flex: 1 }} />
                            <IconButton size='small' onClick={() => {
                                if (selectedClusterId) client.clearConversation(selectedClusterId, data.selectedPeer!)
                            }}>
                                <DeleteSweep fontSize='small' />
                            </IconButton>
                        </Stack>

                        <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                            {conversation.map(m => (
                                <Box key={m.msgId} sx={{ alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '70%' }}>
                                    <Box sx={{ px: 1.25, py: 0.75, borderRadius: 2, bgcolor: m.mine ? 'primary.main' : 'action.hover', color: m.mine ? 'primary.contrastText' : 'text.primary' }}>
                                        <Typography variant='body2' sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</Typography>
                                        <Stack direction='row' alignItems='center' justifyContent='flex-end' sx={{ mt: 0.25, opacity: 0.85 }}>
                                            <Typography variant='caption' sx={{ fontSize: '0.65rem' }}>{fmtTime(m.ts)}</Typography>
                                            <Ticks m={m} />
                                        </Stack>
                                    </Box>
                                </Box>
                            ))}
                            <div ref={endRef} />
                        </Box>

                        <Divider />
                        <Stack direction='row' spacing={1} alignItems='center' sx={{ p: 1 }}>
                            <TextField fullWidth size='small' placeholder='Type a message' value={draft}
                                inputProps={{ autoComplete: 'off' }}
                                onChange={(e) => setDraft(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDraft() } }} />
                            <IconButton color='primary' onClick={sendDraft} disabled={!draft.trim()}><Send /></IconButton>
                        </Stack>
                    </>
                }
            </Box>
        </Box>
    )
}
