import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AppBar, Box, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Button, List, ListItemButton, ListItemText, Stack, Toolbar, Typography } from '@mui/material'
import { IContentProps, HelpButton as _HelpButton, pluginDocsUrl as _pluginDocsUrl } from '@kwirthmagnify/kwirth-common-front'
import { IWebampData } from './WebampData'
import { WebampIcon } from './WebampSetup'
import { IriaPlayLogo } from './IriaPlayLogo'
import { IWebampStream } from '../common/WebampTypes'

/*
    Runtime guard: the core global may serve a version of common-front earlier
    than these exports.
*/
const HelpButton: typeof _HelpButton = typeof _HelpButton === 'function' ? _HelpButton : () => null
const pluginDocsUrl: typeof _pluginDocsUrl = typeof _pluginDocsUrl === 'function' ? _pluginDocsUrl : () => ''

interface IEmptyStateProps {
    title: string
    detail: string
}

/*
    With the channel stopped there is no player to show: the iframe would be
    empty. Same pattern as galaga/asteroids.
*/
const EmptyState: React.FC<IEmptyStateProps> = ({ title, detail }) => (
    <Stack alignItems='center' justifyContent='center' spacing={1}
        sx={{ flex: 1, height: '100%', px: 4, textAlign: 'center' }}>
        <Typography variant='h6' color='text.secondary'>{title}</Typography>
        <Typography variant='body2' color='text.secondary'>{detail}</Typography>
    </Stack>
)

interface IHudState {
    started: boolean
    paused: boolean
}

/**
 * Tab content component.
 *
 * It mounts and unmounts every time the user switches tabs in Kwirth.
 * That is why nothing of the player lives here: only the anchor div for the
 * iframe, which can be recreated.
 *
 * The WebampMachine instance lives in `channelObject.data`, which Kwirth
 * keeps in the ITabObject outside React's tree. When returning to the tab,
 * the iframe re-attaches over the same player and continues where it was.
 *
 * The stream picker dialog is shown when the iframe sends a postMessage
 * asking for a stream selection. The selected track is sent back via the
 * machine's `sendSelectedTrack` method.
 */
export const WebampTabContent: React.FC<IContentProps> = (props: IContentProps) => {
    const webampData: IWebampData = props.channelObject.data

    const containerRef = useRef<HTMLDivElement | null>(null)
    const playerAreaRef = useRef<HTMLDivElement | null>(null)

    const [hud, setHud] = useState<IHudState>({
        started: webampData.started,
        paused: webampData.paused,
    })
    const [boxTop, setBoxTop] = useState(0)

    // Stream picker dialog state
    const [pickerOpen, setPickerOpen] = useState(false)
    const [pickerStreams, setPickerStreams] = useState<IWebampStream[]>([])
    const [search, setSearch] = useState('')

    const syncHud = useCallback(() => {
        setHud({
            started: webampData.started,
            paused: webampData.paused,
        })
    }, [webampData])

    // HUD: sync four times per second
    useEffect(() => {
        const id = setInterval(syncHud, 250)
        return () => clearInterval(id)
    }, [syncHud])

    // Channel height: measure where the content starts and give it the rest of the window.
    useEffect(() => {
        const measure = () => { if (containerRef.current) setBoxTop(containerRef.current.getBoundingClientRect().top) }
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(document.body)
        return () => observer.disconnect()
    }, [])

    // Wire up the stream picker callback on the machine
    useEffect(() => {
        if (!webampData.machine) return
        webampData.machine.onPickStream = (streams: IWebampStream[]) => {
            setPickerStreams(streams)
            setSearch('')
            setPickerOpen(true)
        }
        return () => {
            if (webampData.machine) webampData.machine.onPickStream = undefined
        }
    }, [webampData, webampData.machine])

    // Attach/detach the machine when the tab mounts/unmounts
    useEffect(() => {
        const area = playerAreaRef.current
        if (!area || !webampData.machine) return
        webampData.machine.attach(area)
        return () => { webampData.machine?.detach() }
    }, [webampData, webampData.machine, hud.started])

    // Set by the core: the channel at fullscreen, without the tab bar.
    const isFullscreen = (props.channelObject as unknown as { isFullscreen?: boolean }).isFullscreen === true

    const handlePick = (stream: IWebampStream) => {
        webampData.machine?.sendSelectedTrack({ url: stream.url, defaultName: stream.name })
        setPickerOpen(false)
    }

    const handleCancelPick = () => {
        // Send empty array to resolve the promise in the iframe
        webampData.machine?.sendSelectedTrack({ url: '', defaultName: '' })
        setPickerOpen(false)
    }

    const filteredStreams = search
        ? pickerStreams.filter(s =>
            s.name.toLowerCase().includes(search.toLowerCase()) ||
            s.url.toLowerCase().includes(search.toLowerCase()))
        : pickerStreams

    return (
        <>
        {/*
            At fullscreen the tab bar disappears, and with it the only thing that said what
            this is and which cluster it is connected to. This bar brings it back: the brand,
            the channel and the cluster.
        */}
        {isFullscreen && (
            <AppBar position='sticky' color='default' elevation={1} sx={{ zIndex: 1300 }}>
                <Toolbar sx={{ gap: 1.5 }}>
                    <IriaPlayLogo height={18} sx={{ mr: 1 }} />
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>{WebampIcon}</Box>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                        <Typography variant='h6' sx={{ fontWeight: 700 }}>Webamp</Typography>
                        {props.channelObject.clusterName && <Typography variant='subtitle1' sx={{ fontWeight: 600, color: 'text.secondary' }}>· {props.channelObject.clusterName}</Typography>}
                    </Box>
                    <Box sx={{ flex: 1 }} />
                    {props.channelObject.clusterUrl && <Typography variant='caption' color='text.secondary'>{props.channelObject.clusterUrl}</Typography>}
                </Toolbar>
            </AppBar>
        )}
        <Box
            ref={containerRef}
            sx={{
                width: '100%',
                height: `calc(100vh - ${boxTop}px - 35px)`,
                minHeight: 220,
                display: 'flex', flexDirection: 'column',
                outline: 'none',
            }}
        >
            {hud.started &&
            <Stack direction='row' spacing={1} alignItems='center'
                sx={{ px: 1, height: 44, flexShrink: 0, borderBottom: 1, borderColor: 'divider' }}>
                <Chip size='small' label='Webamp' />
                <Box sx={{ flex: 1 }} />
                {hud.paused && <Chip size='small' color='warning' label='paused' />}
                <HelpButton docsUrl={pluginDocsUrl(props.channelObject?.clusterUrl, 'webamp')} section='user/02-playing' />
            </Stack>
            }

            {!hud.started &&
                <EmptyState title='Webamp not started'
                    detail='Start the channel (tab settings ⚙ → Start) to open the player. Then drag and drop your audio files.' />
            }

            {hud.started &&
            <Box ref={playerAreaRef} sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 0, position: 'relative' }}>
                {/* The WebampMachine iframe attaches here via the effect above. */}
            </Box>
            }
        </Box>

        {/* Stream picker dialog — shown when the iframe asks for a stream selection */}
        <Dialog open={pickerOpen} onClose={handleCancelPick} maxWidth={false}
            sx={{ '& .MuiDialog-paper': { width: '50vw', maxWidth: '70vw', maxHeight: '70vh' } }}>
            <DialogTitle>Pick a radio stream</DialogTitle>
            <DialogContent>
                <Stack spacing={1} sx={{ mt: 1 }}>
                    <Typography variant='caption' color='text.secondary'>
                        {filteredStreams.length} of {pickerStreams.length} streams
                    </Typography>
                    <List sx={{ flex: 1, overflow: 'auto', maxHeight: '50vh' }}>
                        {filteredStreams.map((stream, index) => (
                            <ListItemButton key={index} onClick={() => handlePick(stream)}>
                                <ListItemText
                                    primary={stream.name || stream.url}
                                    secondary={stream.url}
                                    secondaryTypographyProps={{ noWrap: true, sx: { fontSize: '0.7rem', color: 'text.disabled' } }}
                                />
                            </ListItemButton>
                        ))}
                        {filteredStreams.length === 0 && (
                            <Typography variant='body2' color='text.secondary' sx={{ p: 2, textAlign: 'center' }}>
                                No streams found.
                            </Typography>
                        )}
                    </List>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button variant='outlined' onClick={handleCancelPick}>CANCEL</Button>
            </DialogActions>
        </Dialog>
        </>
    )
}
