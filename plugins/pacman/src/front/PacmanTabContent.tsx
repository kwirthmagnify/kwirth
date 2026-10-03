import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AppBar, Box, Button, Chip, Divider, Paper, Stack, Toolbar, Typography } from '@mui/material'
import { IContentProps, HelpButton as _HelpButton, pluginDocsUrl as _pluginDocsUrl } from '@kwirthmagnify/kwirth-common-front'
import { ENotifyLevel } from '@kwirthmagnify/kwirth-common'
import { IPacmanData } from './PacmanData'
import { IPacmanConfig } from './PacmanConfig'
import { BackScoreStore, MAX_NAME, qualifies } from './PacmanScores'
import { PacmanIcon } from './PacmanSetup'
import { IriaPlayLogo } from './IriaPlayLogo'

/*
    Guarda de runtime: el global del core puede servir una version de common-front anterior a
    estos exports.
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
    level: number
    best: number
    over: boolean
    started: boolean
    paused: boolean
}

/**
 * Componente de la pestana.
 *
 * Se monta y se desmonta cada vez que el usuario cambia de pestana. La maquina
 * del juego vive en `channelObject.data`, fuera del arbol de React.
 */
export const PacmanTabContent: React.FC<IContentProps> = (props: IContentProps) => {
    const pacmanData: IPacmanData = props.channelObject.data
    const pacmanConfig: IPacmanConfig = props.channelObject.config

    const containerRef = useRef<HTMLDivElement | null>(null)
    const gameAreaRef = useRef<HTMLDivElement | null>(null)

    const [hud, setHud] = useState<IHudState>({
        score: pacmanData.score,
        lives: pacmanData.lives,
        level: pacmanData.level,
        best: pacmanData.highScore,
        over: pacmanData.gameOver,
        started: pacmanData.started,
        paused: pacmanData.paused,
    })
    const [scoreSaved, setScoreSaved] = useState(false)
    const [boxTop, setBoxTop] = useState(0)

    const playerName = props.channelObject.userName || 'anon'

    const syncHud = useCallback(() => {
        setHud({
            score: pacmanData.score,
            lives: pacmanData.lives,
            level: pacmanData.level,
            best: pacmanData.highScore,
            over: pacmanData.gameOver,
            started: pacmanData.started,
            paused: pacmanData.paused,
        })
    }, [pacmanData])

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
        if (!area || !pacmanData.machine) return
        pacmanData.machine.attach(area)
        return () => { pacmanData.machine?.detach() }
    }, [pacmanData, pacmanData.machine, hud.started])

    const onBlur = useCallback(() => {
        if (pacmanConfig?.pauseOnBlur && pacmanData.started && !pacmanData.paused) {
            pacmanData.paused = true
        }
    }, [pacmanConfig, pacmanData])

    const onFocus = useCallback(() => {
        if (pacmanConfig?.pauseOnBlur && pacmanData.paused) {
            pacmanData.paused = false
        }
    }, [pacmanConfig, pacmanData])

    const saveScore = useCallback(async () => {
        if (!pacmanData.pendingScore) return
        const name = (playerName.trim() || 'anon').slice(0, MAX_NAME)
        pacmanData.pendingScore = false
        setScoreSaved(true)
        const updated = await pacmanData.scoreStore?.submit({
            name,
            score: pacmanData.score,
            level: pacmanData.level,
            date: new Date().toISOString(),
        })
        if (updated && updated.length) {
            pacmanData.scores = updated
            pacmanData.highScore = Math.max(pacmanData.highScore, updated[0].score)
            return
        }
        const store = pacmanData.scoreStore
        const failure = store instanceof BackScoreStore ? store.lastFailure : undefined
        const detail = failure === 'not-connected'
            ? 'the channel is not connected'
            : 'the server did not answer'
        props.channelObject.notify?.(props.channelObject.channelId, ENotifyLevel.ERROR,
            `The score could not be saved: ${detail}. Stop and start the channel and try again.`)
    }, [pacmanData, playerName])

    const isFullscreen = (props.channelObject as unknown as { isFullscreen?: boolean }).isFullscreen === true

    return (
        <>
        {isFullscreen && (
            <AppBar position='sticky' color='default' elevation={1} sx={{ zIndex: 1300 }}>
                <Toolbar sx={{ gap: 1.5 }}>
                    <IriaPlayLogo height={18} sx={{ mr: 1 }} />
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>{PacmanIcon}</Box>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                        <Typography variant='h6' sx={{ fontWeight: 700 }}>Pac-Man</Typography>
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
                <Chip size='small' label={`Level ${hud.level}`} variant='outlined' />
                <Chip size='small' label={`Best ${hud.best}`} variant='outlined' />
                <Box sx={{ flex: 1 }} />
                {hud.paused && <Chip size='small' color='warning' label='paused' />}
                <HelpButton docsUrl={pluginDocsUrl(props.channelObject?.clusterUrl, 'pacman')} section='user/04-playing' />
            </Stack>
            }

            {!hud.started &&
                <EmptyState title='Pac-Man not started'
                    detail='Start the channel (tab settings ⚙ → Start) to play.' />
            }

            {hud.started &&
            <Box ref={gameAreaRef} sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 0, position: 'relative' }}>
                {/* The PacmanMachine iframe attaches here via the effect above. */}

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

                        {pacmanData.scores.length === 0 &&
                            <Typography variant='caption' color='text.secondary'>No scores yet.</Typography>
                        }
                        {pacmanData.scores.map((entry, index) => (
                            <Stack key={`${entry.name}-${entry.date}-${index}`} direction='row' spacing={1} sx={{ py: 0.25 }}>
                                <Typography variant='caption' sx={{ width: 20, color: 'text.secondary' }}>{index + 1}</Typography>
                                <Typography variant='caption' sx={{ flex: 1 }}>{entry.name}</Typography>
                                <Typography variant='caption' sx={{ color: 'text.secondary' }}>L{entry.level}</Typography>
                                <Typography variant='caption' sx={{ width: 56, textAlign: 'right' }}>{entry.score}</Typography>
                            </Stack>
                        ))}

                        {pacmanData.pendingScore && !scoreSaved &&
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
                            Press Space to insert coin, 1 to play
                        </Typography>
                    </Paper>
                }
            </Box>
            }

            {hud.started &&
                <Stack direction='row' spacing={2} justifyContent='center' alignItems='center'
                    sx={{ px: 1, height: 28, flexShrink: 0, borderTop: 1, borderColor: 'divider' }}>
                    <Typography variant='caption' color='text.secondary'>
                        <b>←</b> <b>→</b> <b>↑</b> <b>↓</b> Move &nbsp; <b>Space</b> Insert Coin &nbsp; <b>1</b> 1P Start &nbsp; <b>2</b> 2P Start
                    </Typography>
                </Stack>
            }
        </Box>
        </>
    )
}
