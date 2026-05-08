import React, { useRef, useState } from 'react'
import { Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, TextField, Typography } from '@mui/material'
import { ISetupProps } from '../IChannel'
import { feedsAvailable, INewsChannelConfig, INewsInstanceConfig, NewsChannelConfig, NewsInstanceConfig } from './NewsConfig'
import { Newspaper } from '@mui/icons-material'

const NewsIcon = <Newspaper />

const NewsSetup: React.FC<ISetupProps> = (props: ISetupProps) => {
    const newsInstanceConfig: INewsInstanceConfig = props.setupConfig?.channelInstanceConfig || new NewsInstanceConfig()
    const newsChannelConfig: INewsChannelConfig = props.setupConfig?.channelConfig || new NewsChannelConfig()

    const [maxItems, setMaxItems] = useState(newsChannelConfig.maxItems)
    const [selectedFeeds, setSelectedFeeds] = useState<string[]>(newsInstanceConfig.selectedFeeds ?? [...feedsAvailable])
    const defaultRef = useRef<HTMLInputElement | null>(null)

    const toggleFeed = (feed: string) => {
        setSelectedFeeds(prev => prev.includes(feed) ? prev.filter(f => f !== feed) : [...prev, feed])
    }

    const ok = () => {
        newsChannelConfig.maxItems = maxItems
        newsInstanceConfig.selectedFeeds = selectedFeeds
        props.onChannelSetupClosed(props.channel, {
            channelId: props.channel.channelId,
            channelConfig: newsChannelConfig,
            channelInstanceConfig: newsInstanceConfig
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
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '25vw', maxWidth: '35vw' } }}>
            <DialogTitle>Configure News channel</DialogTitle>
            <DialogContent>
                <Stack direction='column' spacing={1} sx={{ m: 1 }}>
                    <TextField value={maxItems} onChange={e => setMaxItems(+e.target.value)} type='number' variant='standard' label='Max items' fullWidth />
                    <Typography variant='body2' sx={{ mt: 1 }}><b>Topics</b></Typography>
                    {feedsAvailable.map(feed => (
                        <FormControlLabel
                            key={feed}
                            control={<Checkbox checked={selectedFeeds.includes(feed)} onChange={() => toggleFeed(feed)} />}
                            label={feed}
                        />
                    ))}
                </Stack>
            </DialogContent>
            <DialogActions>
                <FormControlLabel control={<Checkbox slotProps={{ input: { ref: defaultRef } }} />} label='Set as default' sx={{ width: '100%', ml: '8px' }} />
                <Button onClick={ok}>OK</Button>
                <Button onClick={cancel}>CANCEL</Button>
            </DialogActions>
        </Dialog>
    )
}

export { NewsSetup, NewsIcon }
