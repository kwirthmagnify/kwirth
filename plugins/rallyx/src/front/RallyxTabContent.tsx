import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AppBar, Box, Button, Chip, Divider, Paper, Stack, Toolbar, Typography } from '@mui/material'
import { IContentProps, HelpButton as _HelpButton, pluginDocsUrl as _pluginDocsUrl } from '@kwirthmagnify/kwirth-common-front'
import { ENotifyLevel } from '@kwirthmagnify/kwirth-common'
import { IRallyxData } from './RallyxData'
import { IRallyxConfig } from './RallyxConfig'
import { BackScoreStore, MAX_NAME, qualifies } from './RallyxScores'
import { RallyxIcon } from './RallyxSetup'
import { IriaPlayLogo } from './IriaPlayLogo'

/*
    Runtime guard: the core global may serve an older version of common-front.
*/
const HelpButton: typeof _HelpButton = typeof _HelpButton === 'function' ? _HelpButton : () => null
const pluginDocsUrl: typeof _pluginDocsUrl = typeof _pluginDocsUrl === 'function' ? _pluginDocsUrl : () => ''

interface IEmptyStateProps {
    title: string
    detail: string
}

const EmptyState: React.FC<IEmptyStateProps> = ({ title, detail }) => (
    <Stack alignItems='center' justifyContent='center' spacing={1}
        sx={{ flex: 1, height: '100%', px: 4, textAlign: 'center' }}>
        <Typography variant='h6' color='text.secondary'>{title}</Typography>
        <Typography variant='body2' color='text.secondary'>{detail}</Typography>
    </Stack>
)

interface IHudState {
    score: number
    lives: number
    round: number
    fuel: number
    best: number
    over: boolean
    started: boolean
    paused: boolean
}

/**
 * Tab content component.
 *
 * It mounts and unmounts every time the user switches tabs. The game machine
 * lives in `channelObject.data`, outside React's tree.
 */
export const RallyxTabContent: React.FC<IContentProps> = (props: IContentProps) => {
    const rallyxData: IRallyxData = props.channelObject.data
    const rallyxConfig: IRallyxConfig = props.channelObject.config

    const containerRef = useRef<HTMLDivElement | null>(null)
    const gameAreaRef = useRef<HTMLDivElement | null>(null)

    const [hud, setHud] = useState<IHudState>({
        score: rallyxData.score,
        lives: rallyxData.lives,
        round: rallyxData.round,
        fuel: rallyxData.fuel,
        best: rallyxData.highScore,
        over: rallyxData.gameOver,
        started: rallyxData.started,
        paused: rallyxData.paused,
    })
    const [scoreSaved, setScoreSaved] = useState(false)
    const [boxTop, setBoxTop] = useState(0)

    const playerName = props.channelObject.userName || 'anon'

    const syncHud = useCallback(() => {
        setHud({
            score: rallyxData.score,
            lives: rallyxData.lives,
            round: rallyxData.round,
            fuel: rallyxData.fuel,
            best: rallyxData.highScore,
            over: rallyxData.gameOver,
            started: rallyxData.started,
            paused: rallyxData.paused,
        })
    }, [rallyxData])

    useEffect(() => {
        const id = setInterval(syncHud, 250)
        return () => clearInterval(id)
    }, [syncHud])

    useEffect(() => {
        const measure = () => { if (containerRef.current) setBoxTop(containerRef.current.getBoundingClientRect().top) }
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(document.body)
        return () => observer.disconnect()
    }, [])

    // Attach/detach the machine when the tab mounts/unmounts
    useEffect(() => {
        const area = gameAreaRef.current
        if (!area || !rallyxData.machine) return
        rallyxData.machine.attach(area)
        return () => { rallyxData.machine?.detach() }
    }, [rallyxData, rallyxData.machine, hud.started])

    const onBlur = useCallback(() => {
        if (rallyxConfig?.pauseOnBlur && rallyxData.started && !rallyxData.paused) {
            rallyxData.paused = true
        }
    }, [rallyxConfig, rallyxData])

    const onFocus = useCallback(() => {
        if (rallyxConfig?.pauseOnBlur && rallyxData.paused) {
            rallyxData.paused = false
        }
    }, [rallyxConfig, rallyxData])

    const saveScore = useCallback(async () => {
        if (!rallyxData.pendingScore) return
        const name = (playerName.trim() || 'anon').slice(0, MAX_NAME)
        rallyxData.pendingScore = false
        setScoreSaved(true)
        const updated = await rallyxData.scoreStore?.submit({
            name,
            score: rallyxData.score,
            level: rallyxData.round,
            date: new Date().toISOString(),
        })
        if (updated && updated.length) {
            rallyxData.scores = updated
            rallyxData.highScore = Math.max(rallyxData.highScore, updated[0].score)
            return
        }
        const store = rallyxData.scoreStore
        const failure = store instanceof BackScoreStore ? store.lastFailure : undefined
        const detail = failure === 'not-connected'
            ? 'the channel is not connected'
            : 'the server did not answer'
        props.channelObject.notify?.(props.channelObject.channelId, ENotifyLevel.ERROR,
            `The score could not be saved: ${detail}. Stop and start the channel and try again.`)
    }, [rallyxData, playerName])

    const isFullscreen = (props.channelObject as unknown as { isFullscreen?: boolean }).isFullscreen === true

    return (
        <>
        {isFullscreen && (
            <AppBar position='sticky' color='default' elevation={1} sx={{ zIndex: 1300 }}>
                <Toolbar sx={{ gap: 1.5 }}>
                    <IriaPlayLogo height={18} sx={{ mr: 1 }} />
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>{RallyxIcon}</Box>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                        <Typography variant='h6' sx={{ fontWeight: 700 }}>Rally-X</Typography>
                        {props.channelObject.clusterName && <Typography variant='subtitle1' sx={{ fontWeight: 600, color: 'text.secondary' }}>· {props.channelObject.clusterName}</Typography>}
                    </Box>
                    <Box sx={{ flex: 1 }} />
                    {props.channelObject.clusterUrl && <Typography variant='caption' color='text.secondary'>{props.channelObject.clusterUrl}</Typography>}
                </Toolbar>
            </AppBar>
        )}
        <Box
            ref={containerRef}
            tabIndex={0}
            onBlur={onBlur}
            onFocus={onFocus}
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
                <Chip size='small' label={`Score ${hud.score}`} />
                <Chip size='small' label={`Lives ${hud.lives}`} variant='outlined' />
                <Chip size='small' label={`Round ${hud.round}`} variant='outlined' />
                <Chip size='small' label={`Fuel ${hud.fuel}`} variant='outlined' />
                <Chip size='small' label={`Best ${hud.best}`} variant='outlined' />
                <Box sx={{ flex: 1 }} />
                {hud.paused && <Chip size='small' color='warning' label='paused' />}
                <HelpButton docsUrl={pluginDocsUrl(props.channelObject?.clusterUrl, 'rallyx')} section='user/04-playing' />
            </Stack>
            }

            {!hud.started &&
                <EmptyState title='Rally-X not started'
                    detail='Start the channel (tab settings ⚙ → Start) to play.' />
            }

            {hud.started &&
            <Box ref={gameAreaRef} sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 0, position: 'relative' }}>
                {/* The RallyxMachine iframe attaches here via the effect above. */}

                {hud.over &&
                    <Paper
                        elevation={8}
                        sx={{
                            position: 'absolute', minWidth: 260, maxWidth: '80%',
                            p: 2, opacity: 0.97,
                        }}
                    >
                        <Typography variant='subtitle2' gutterBottom>High scores</Typography>
                        <Divider sx={{ mb: 1 }} />

                        {rallyxData.scores.length === 0 &&
                            <Typography variant='caption' color='text.secondary'>No scores yet.</Typography>
                        }
                        {rallyxData.scores.map((entry, index) => (
                            <Stack key={`${entry.name}-${entry.date}-${index}`} direction='row' spacing={1} sx={{ py: 0.25 }}>
                                <Typography variant='caption' sx={{ width: 20, color: 'text.secondary' }}>{index + 1}</Typography>
                                <Typography variant='caption' sx={{ flex: 1 }}>{entry.name}</Typography>
                                <Typography variant='caption' sx={{ color: 'text.secondary' }}>R{entry.level}</Typography>
                                <Typography variant='caption' sx={{ width: 56, textAlign: 'right' }}>{entry.score}</Typography>
                            </Stack>
                        ))}

                        {rallyxData.pendingScore && !scoreSaved &&
                            <>
                                <Divider sx={{ my: 1 }} />
                                <Typography variant='caption' color='text.secondary'>
                                    {hud.score} points — you made the table
                                </Typography>
                                <Stack direction='row' spacing={1} sx={{ mt: 1 }} alignItems='center'>
                                    <Typography variant='caption' sx={{ flex: 1 }}>
                                        Saving as <b>{playerName}</b>
                                    </Typography>
                                    <Button size='small' variant='contained' onClick={() => void saveScore()}>Save</Button>
                                </Stack>
                            </>
                        }

                        <Divider sx={{ my: 1 }} />
                        <Typography variant='caption' color='text.secondary'>
                            Press Space or Ctrl to play again
                        </Typography>
                    </Paper>
                }
            </Box>
            }

            {hud.started &&
                <Stack direction='row' spacing={2} justifyContent='center' alignItems='center'
                    sx={{ px: 1, height: 28, flexShrink: 0, borderTop: 1, borderColor: 'divider' }}>
                    <Typography variant='caption' color='text.secondary'>
                        <b>←</b> <b>↑</b> <b>→</b> <b>↓</b> Drive &nbsp; <b>Ctrl</b> Smoke &nbsp; <b>Space</b>/<b>Ctrl</b> Start
                    </Typography>
                </Stack>
            }
        </Box>
        </>
    )
}
