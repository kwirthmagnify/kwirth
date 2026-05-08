import { useEffect, useRef, useState } from 'react'
import { Box, Card, CardContent, CardHeader, Chip, Link, Stack, Typography } from '@mui/material'
import { IChannelObject } from '../IChannel'
import { INewsData, INewsItem } from './NewsData'
import { INewsChannelConfig } from './NewsConfig'
import { Info } from '@mui/icons-material'
import React from 'react'

interface IContentProps {
    webSocket?: WebSocket
    channelObject: IChannelObject
}

const NewsTabContent: React.FC<IContentProps> = (props: IContentProps) => {
    const newsData: INewsData = props.channelObject.data
    const newsConfig: INewsChannelConfig = props.channelObject.config
    const newsBoxRef = useRef<HTMLDivElement | null>(null)
    const [newsBoxTop, setNewsBoxTop] = useState(0)

    useEffect(() => {
        if (newsBoxRef.current) setNewsBoxTop(newsBoxRef.current.getBoundingClientRect().top)
    })

    const categoryColors: Record<string, 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info'> = {
        kubernetes: 'primary',
        ai: 'secondary',
    }
    const categoryColor = (category: string) => categoryColors[category] ?? 'default'

    const formatDate = (pubDate: string) => {
        const d = new Date(pubDate)
        if (isNaN(d.getTime())) return pubDate
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString()
    }

    const showItems = () => {
        if (!newsData?.items) return <></>
        return newsData.items.map((item: INewsItem, index: number) => (
            <Box key={index} sx={{ mb: 1, p: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Stack direction='row' alignItems='center' spacing={1} sx={{ mb: 0.5 }}>
                    <Chip label={item.category} color={categoryColor(item.category)} size='small' />
                    <Chip label={item.source} variant='outlined' size='small' />
                    <Typography variant='caption' color='text.secondary'>{formatDate(item.pubDate)}</Typography>
                </Stack>
                <Link href={item.link} target='_blank' rel='noopener' underline='hover'>
                    <Typography variant='body2' fontWeight='bold'>{item.title}</Typography>
                </Link>
                {item.description && (
                    <Typography variant='caption' color='text.secondary' display='block' sx={{ mt: 0.5 }}>{item.description}</Typography>
                )}
            </Box>
        ))
    }

    return (
        <>
            {newsData.started &&
                <Card sx={{ display: 'flex', flexDirection: 'column', flex: 1, width: '98%', alignSelf: 'center', marginTop: '8px', minHeight: 0 }}>
                    <CardHeader title={
                        <Stack direction='row' alignItems='center'>
                            <Typography marginRight='32px'><b>Items:</b> {newsData.items.length} / {newsConfig.maxItems}</Typography>
                            <Typography marginRight='32px' flex={1}><Info fontSize='small' sx={{ marginBottom: '2px' }} /><b>&nbsp;Status:</b> {newsData.paused ? 'paused' : 'started'}</Typography>
                        </Stack>
                    } />
                    <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, p: 0, '&:last-child': { pb: 0 } }}>
                        <Box ref={newsBoxRef} sx={{ display: 'flex', flexDirection: 'column', width: '100%', overflowY: 'auto', flexGrow: 1, height: `calc(100vh - ${newsBoxTop}px - 16px)` }}>
                            <Box sx={{ flex: 1, overflowY: 'auto', ml: 1, mr: 1 }}>
                                {showItems()}
                            </Box>
                        </Box>
                    </CardContent>
                </Card>
            }
        </>
    )
}

export { NewsTabContent }
