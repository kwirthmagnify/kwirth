import React, { useEffect, useRef, useState } from 'react'
import { Box, Card, CardContent, CardHeader, Chip, Link, Stack, Typography } from '@mui/material'
import { Info } from '@mui/icons-material'
import { EInstanceConfigView } from '@kwirthmagnify/kwirth-common'
import { INewsData, INewsItem } from './NewsData'
import { INewsChannelConfig } from './NewsConfig'
import { IContentProps } from '@kwirthmagnify/kwirth-common-front'

export const NewsTabContent: React.FC<IContentProps> = (props: IContentProps) => {
    const newsData: INewsData = props.channelObject.data
    const newsConfig: INewsChannelConfig = props.channelObject.config

    if (!newsData || !newsConfig) return <></>
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

    const plainText = (html: string): string => {
        const decode = (s: string) => {
            const div = document.createElement('div')
            div.innerHTML = s
            return (div.textContent ?? div.innerText ?? '').trim()
        }
        return decode(decode(html)).replace(/<[^>]*>/g, '').trim()
    }

    const showItems = () => {
        if (!newsData?.items) return <></>
        return [...newsData.items]
            .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
            .map((item: INewsItem, index: number) => (
            <Box key={index} sx={{ mb: 1, p: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Stack direction='row' alignItems='center' spacing={1} sx={{ mb: 0.5 }}>
                    <Chip label={item.category} color={categoryColor(item.category)} size='small' />
                    <Chip label={item.source} variant='outlined' size='small' />
                    <Typography variant='caption' color='text.secondary'>{formatDate(item.pubDate)}</Typography>
                </Stack>
                <a href={item.link} target='_blank' rel='noopener'>
                    <Typography variant='body2' fontWeight='bold'>{item.title}</Typography>
                </a>
                {item.description && (
                    <Typography variant='caption' color='text.secondary' display='block' sx={{ mt: 0.5 }}>{plainText(item.description)}</Typography>
                )}
            </Box>
        ))
    }

    const isCluster = props.channelObject.view === EInstanceConfigView.CLUSTER
    const resourceParts: string[] = []
    if (!isCluster) {
        if (props.channelObject.namespace) resourceParts.push(`namespaces: ${props.channelObject.namespace}`)
        if (props.channelObject.group) resourceParts.push(`groups: ${props.channelObject.group}`)
        if (props.channelObject.pod) resourceParts.push(`pods: ${props.channelObject.pod}`)
        if (props.channelObject.container) resourceParts.push(`containers: ${props.channelObject.container}`)
    }

    return (
        <>
            {newsData.started &&
                <Card sx={{ display: 'flex', flexDirection: 'column', flex: 1, width: '98%', alignSelf: 'center', marginTop: '8px', minHeight: 0 }}>
                    <CardHeader title={
                        <Stack direction='row' alignItems='center'>
                            <Typography marginRight='32px'><b>Items:</b> {newsData.items.length} / {newsConfig.maxItems}</Typography>
                            <Typography marginRight='32px' flex={1}><Info fontSize='small' sx={{ marginBottom: '2px' }} /><b>&nbsp;Status:</b> {newsData.paused ? 'paused' : 'started'}</Typography>
                            <Typography><b>Mode:</b> {isCluster ? 'cluster' : 'resourced'}</Typography>
                        </Stack>
                    } />
                    <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, p: 0, '&:last-child': { pb: 0 } }}>
                        {!isCluster && resourceParts.length > 0 && (
                            <Box sx={{ px: 1, py: 0.5, bgcolor: 'action.hover', borderBottom: '1px solid', borderColor: 'divider' }}>
                                <Typography variant='caption' color='text.secondary'><b>Resources:</b> {resourceParts.join(' · ')}</Typography>
                            </Box>
                        )}
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
