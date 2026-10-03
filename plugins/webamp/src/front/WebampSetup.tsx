import React, { useEffect, useRef, useState } from 'react'
import { Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Select, Stack, Typography } from '@mui/material'
import { ISetupProps, DialogTitleHelp as _DialogTitleHelp, pluginDocsUrl as _pluginDocsUrl } from '@kwirthmagnify/kwirth-common-front'

import { WebampMusicNote } from './icons'
import { WebampConfig, WebampInstanceConfig, DEFAULT_M3U_URL } from './WebampConfig'

/*
    Runtime guard: the core global may serve a version of common-front earlier
    than these exports. Without this, DialogTitleHelp would arrive as undefined
    and React would crash when rendering the entire dialog.
*/
const DialogTitleHelp: typeof _DialogTitleHelp = typeof _DialogTitleHelp === 'function'
    ? _DialogTitleHelp
    : (props) => <DialogTitle sx={props.sx} id={props.id}>{props.children}</DialogTitle>
const pluginDocsUrl: typeof _pluginDocsUrl = typeof _pluginDocsUrl === 'function'
    ? _pluginDocsUrl
    : () => ''

/** GitHub repo that hosts the M3U playlists. */
const REPO_API = 'https://api.github.com/repos/junguler/m3u-radio-music-playlists/contents/'
const REPO_RAW = 'https://raw.githubusercontent.com/junguler/m3u-radio-music-playlists/main/'

/** Extract the filename from a raw URL (for re-selecting in the dropdown). */
function urlToFilename(url: string): string {
    if (!url) return ''
    const idx = url.lastIndexOf('/')
    return idx >= 0 ? url.substring(idx + 1) : url
}

export const WebampIcon = <WebampMusicNote />

export const WebampSetup: React.FC<ISetupProps> = (props: ISetupProps) => {
    const instanceConfig: WebampInstanceConfig = props.setupConfig?.channelInstanceConfig || new WebampInstanceConfig()
    const config: WebampConfig = props.setupConfig?.channelConfig || new WebampConfig()
    const defaultRef = useRef<HTMLInputElement | null>(null)

    const currentUrl = instanceConfig.m3uUrl || DEFAULT_M3U_URL
    const [selectedFile, setSelectedFile] = useState(urlToFilename(currentUrl))
    const [files, setFiles] = useState<string[]>([])
    const [loading, setLoading] = useState(true)

    // Fetch the list of .m3u files from the GitHub repo on mount.
    useEffect(() => {
        let cancelled = false
        fetch(REPO_API)
            .then(r => r.ok ? r.json() : [])
            .then((items: Array<{ name: string }>) => {
                if (cancelled) return
                const m3us = items
                    .filter(i => i.name.endsWith('.m3u'))
                    .map(i => i.name)
                    .sort((a, b) => a.localeCompare(b))
                // If the currently-selected file is not in the list (e.g. custom
                // URL or fetch returned a partial list), add it so the Select
                // does not warn about an out-of-range value.
                if (selectedFile && !m3us.includes(selectedFile)) {
                    m3us.unshift(selectedFile)
                }
                setFiles(m3us)
                setLoading(false)
            })
            .catch(() => {
                if (cancelled) return
                setFiles([])
                setLoading(false)
            })
        return () => { cancelled = true }
    }, [])

    const ok = () => {
        const url = selectedFile ? REPO_RAW + selectedFile : ''
        instanceConfig.m3uUrl = url
        props.onChannelSetupClosed(props.channel, {
            channelId: props.channel.channelId,
            channelConfig: config,
            channelInstanceConfig: instanceConfig
        }, true, defaultRef.current?.checked || false)
    }

    const cancel = () => {
        props.onChannelSetupClosed(props.channel, {
            channelId: props.channel.channelId,
            channelConfig: undefined,
            channelInstanceConfig: undefined
        }, false, false)
    }

    return (
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '42vw', maxWidth: '56vw' } }}>
            <DialogTitleHelp docsUrl={pluginDocsUrl(props.channelObject?.clusterUrl, 'webamp')} section='user/01-introduction'>
                Configure Webamp channel
            </DialogTitleHelp>
            <DialogContent>
                <Stack direction='column' spacing={2} sx={{ m: 1 }}>
                    <Typography variant='body2' color='text.secondary'>
                        Webamp is a Winamp 2 clone that runs in the browser. On start, it fetches
                        the selected M3U playlist and loads the entries as initial tracks. You can
                        also drag and drop local audio files (MP3, OGG, WAV, FLAC, M4A...) and
                        skins (.wsz) onto the player.
                    </Typography>
                    <Typography variant='subtitle2' sx={{ mt: 1 }}>
                        Playlist
                    </Typography>
                    <Select
                        value={loading ? '' : selectedFile}
                        onChange={e => setSelectedFile(e.target.value as string)}
                        size='small'
                        fullWidth
                        disabled={loading}
                        displayEmpty
                        renderValue={value => {
                            if (loading) return 'Loading playlists…'
                            if (!value) return 'Select a playlist…'
                            // Human-readable label: strip .m3u, replace underscores with spaces.
                            return value.replace(/\.m3u$/, '').replace(/_/g, ' ')
                        }}
                    >
                        {files.map(file => (
                            <MenuItem key={file} value={file}>
                                {file.replace(/\.m3u$/, '').replace(/_/g, ' ')}
                            </MenuItem>
                        ))}
                    </Select>
                    {files.length === 0 && !loading && (
                        <Typography variant='caption' color='text.secondary' sx={{ fontStyle: 'italic' }}>
                            Could not fetch the playlist list. The default 80s playlist will be used.
                        </Typography>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                <FormControlLabel control={<Checkbox slotProps={{ input: { ref: defaultRef } }} />} label='Set as default' sx={{ width: '100%', ml: '8px' }} />
                <Button variant='outlined' onClick={ok}>OK</Button>
                <Button variant='outlined' onClick={cancel}>CANCEL</Button>
            </DialogActions>
        </Dialog>
    )
}
