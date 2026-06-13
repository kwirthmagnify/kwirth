import React from 'react'
import { Box, Button, Card, CardContent, Stack, Tooltip, Typography } from '@mui/material'
import { OpenInBrowser } from '@mui/icons-material'
import { IHomepageProps } from '@kwirthmagnify/kwirth-common-front'

const StatusLight: React.FC<{ color: string; active?: boolean; label: string }> = ({ color, active, label }) => (
    <Tooltip title={label}>
        <Box sx={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            bgcolor: color,
            opacity: active ? 1 : 0.2,
            boxShadow: active ? `0 0 6px 2px ${color}` : 'none',
            transition: 'all 0.3s ease',
            cursor: 'default'
        }} />
    </Tooltip>
)

const Clusterized: React.FC<IHomepageProps> = (props) => {
    const launchMagnify = (clusterName: string) => {
        props.onHomepageSelectTab({
            name: clusterName,
            description: '',
            channel: 'magnify',
            channelObject: {
                clusterName,
                view: 'cluster',
                namespace: '',
                group: '',
                pod: '',
                container: ''
            }
        })
    }

    return (
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', height: '100%' }}>
            {props.clusters.map(cluster => (
                <Card key={cluster.name} variant="outlined">
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Stack direction="row" alignItems="center" spacing={2}>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="h6" sx={{ lineHeight: 1.3 }}>{cluster.name}</Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                                    {cluster.url}
                                </Typography>
                            </Box>
                            <Stack direction="row" spacing={0.75} alignItems="center">
                                <StatusLight color="#4caf50" label="Healthy" />
                                <StatusLight color="#ff9800" label="Warning" />
                                <StatusLight color="#f44336" label="Critical" />
                            </Stack>
                            <Button
                                variant="outlined"
                                size="small"
                                startIcon={<OpenInBrowser />}
                                onClick={() => launchMagnify(cluster.name)}
                            >
                                Magnify
                            </Button>
                        </Stack>
                    </CardContent>
                </Card>
            ))}
            {props.clusters.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                    No clusters defined. Add a cluster to get started.
                </Typography>
            )}
        </Box>
    )
}

export { Clusterized }
