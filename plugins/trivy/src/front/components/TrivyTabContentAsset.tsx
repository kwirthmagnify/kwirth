import React, { useState } from 'react'
import { Avatar, Box, Card, CardContent, CardHeader, CardMedia, Chip, Divider, IconButton, Menu, MenuItem, MenuList, Stack, Tooltip, Typography } from '@mui/material'
import { MoreVert, Visibility as VisibilityIcon, Replay as ReplayIcon } from '@mui/icons-material'
import { assetAvatarColor, getAvatarContent } from '../TrivyCommon'
import { IChannelObject } from '@kwirthmagnify/kwirth-common-front'
import { EInstanceMessageAction, EInstanceMessageChannel, EInstanceMessageFlow, EInstanceMessageType } from '@kwirthmagnify/kwirth-common'
import { IAsset, TRIVY_API_AUDIT_PLURAL, TRIVY_API_EXPOSED_PLURAL, TRIVY_API_VULN_PLURAL } from '../TrivyData'
import { ETrivyCommand, ITrivyMessage } from '../../common/TrivyTypes'

interface ITrivyTabContentAssetProps {
    asset: IAsset
    channelObject: IChannelObject
    mode: 'list' | 'card'
    onShowVulns: (asset: IAsset) => void
    onShowAudit: (asset: IAsset) => void
    onShowExposed: (asset: IAsset) => void
    onShowSbom: (asset: IAsset) => void
    onRescan: (asset: IAsset) => void
}

/*
    Cut to fit the card, with the ellipsis only when something was actually cut. It used to be appended
    always, so a short name read 'kwirth...' and looked truncated when it was whole.
*/
const shorten = (value: string | undefined, max: number): string => {
    if (!value) return 'NA'
    return value.length > max ? `${value.substring(0, max)}…` : value
}

/** The whole thing, for the tooltip: what is on the card is never enough to tell two pods apart. */
const fullName = (asset: IAsset): string =>
    `${asset.namespace || 'NA'} / ${asset.name || 'NA'}${asset.container ? ` / ${asset.container}` : ''}`

export const getTotalIssues = (plural: string, asset: IAsset) => {
    let sum = (asset as any)[plural]?.report?.summary
    let c = sum?.criticalCount
    let h = sum?.highCount
    let m = sum?.mediumCount
    let l = sum?.lowCount
    return (c + h + m + l) || 0
}

const simpleBarChart = (asset: IAsset) => {
    const vulns = getTotalIssues(TRIVY_API_VULN_PLURAL, asset)
    const audit = getTotalIssues(TRIVY_API_AUDIT_PLURAL, asset)
    const exposed = getTotalIssues(TRIVY_API_EXPOSED_PLURAL, asset)
    const sbom = (asset.sbomreports.report?.components?.components?.length) || 0
    const maxHeightPx = 100
    const maxDataValue = Math.max(vulns, audit, sbom, exposed, 1)
    const bars = [
        { label: 'Vulns', value: vulns, height: (vulns / maxDataValue) * maxHeightPx, color: 'error.main' },
        { label: 'Audit', value: audit, height: (audit / maxDataValue) * maxHeightPx, color: 'error.main' },
        { label: 'Exposed', value: exposed, height: (exposed / maxDataValue) * maxHeightPx, color: 'error.main' },
        { label: 'SBOM', value: sbom, height: (sbom / maxDataValue) * maxHeightPx, color: 'success.main' },
    ]
    return (
        <Box display='flex' alignItems='flex-end' justifyContent='space-around' height={maxHeightPx + 40} width='100%' padding={1} bgcolor='background.paper'>
            {bars.map((bar, index) => (
                <Box key={index} textAlign='center' sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Typography variant='caption' sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>{bar.value}</Typography>
                    <Box width={30} height={bar.height} bgcolor={bar.color} marginX={1} sx={{ transition: 'height 0.3s ease', borderRadius: '2px 2px 0 0' }} />
                    <Typography variant='caption' sx={{ fontSize: '0.65rem' }}>{bar.label}</Typography>
                </Box>
            ))}
        </Box>
    )
}

const TrivyTabContentAsset: React.FC<ITrivyTabContentAssetProps> = (props: ITrivyTabContentAssetProps) => {
    const [anchorMenu, setAnchorMenu] = useState<HTMLElement | undefined>(undefined)

    const rescan = (asset: IAsset) => {
        if (props.channelObject.webSocket) {
            const trivyMessage: ITrivyMessage = {
                msgtype: 'trivymessage', id: '1', accessKey: props.channelObject.accessString!,
                instance: props.channelObject.instanceId, namespace: asset.namespace, group: '',
                pod: asset.name, container: asset.container, command: ETrivyCommand.RESCAN,
                action: EInstanceMessageAction.COMMAND, flow: EInstanceMessageFlow.REQUEST,
                type: EInstanceMessageType.DATA, channel: EInstanceMessageChannel.TRIVY
            }
            props.channelObject.webSocket.send(JSON.stringify(trivyMessage))
            props.onRescan(asset)
        }
    }

    const assetMenu = (
        <Menu anchorEl={anchorMenu} open={Boolean(anchorMenu)} onClose={() => setAnchorMenu(undefined)}>
            <MenuList dense sx={{ minWidth: 200 }}>
                <MenuItem onClick={() => { setAnchorMenu(undefined); props.onShowVulns(props.asset) }} disabled={!props.asset.vulnerabilityreports.report || getTotalIssues(TRIVY_API_VULN_PLURAL, props.asset) === 0}><VisibilityIcon />&nbsp;&nbsp;Vulnerabilities</MenuItem>
                <MenuItem onClick={() => { setAnchorMenu(undefined); props.onShowAudit(props.asset) }} disabled={!props.asset.configauditreports.report || getTotalIssues(TRIVY_API_AUDIT_PLURAL, props.asset) === 0}><VisibilityIcon />&nbsp;&nbsp;Config audit</MenuItem>
                <MenuItem onClick={() => { setAnchorMenu(undefined); props.onShowExposed(props.asset) }} disabled={!props.asset.exposedsecretreports.report || getTotalIssues(TRIVY_API_EXPOSED_PLURAL, props.asset) === 0}><VisibilityIcon />&nbsp;&nbsp;Exposed secrets</MenuItem>
                <MenuItem onClick={() => { setAnchorMenu(undefined); props.onShowSbom(props.asset) }} disabled={!props.asset.sbomreports.report}><VisibilityIcon />&nbsp;&nbsp;SBOM</MenuItem>
                <MenuItem onClick={() => { setAnchorMenu(undefined); rescan(props.asset) }}><ReplayIcon />&nbsp;&nbsp;Re-scan</MenuItem>
            </MenuList>
        </Menu>
    )

    if (props.mode === 'card') return (<>
        <Card sx={{ width: '100%', height: '280px', borderWidth: '1px', borderStyle: 'solid', borderColor: 'divider' }}>
            <CardHeader
                /*
                    🔴 `minWidth: 0` on the header's content, or the chip is the one that gets clipped.

                    A flex item will not shrink below its content's size by default, so with the name on
                    one line the row grew past the card and the kind chip was cut off at the edge
                    ('ReplicaS…'). With this the NAME gives way —it has an ellipsis and a tooltip with
                    the whole thing— and the chip, which is short and is what tells a controller from a
                    pod, stays whole.
                */
                sx={{ '& .MuiCardHeader-content': { minWidth: 0, overflow: 'hidden' } }}
                avatar={<Avatar sx={{ background: assetAvatarColor(props.asset.vulnerabilityreports?.report?.os?.family || 'X') }}>{getAvatarContent(props.asset.vulnerabilityreports?.report?.os?.family || 'X')}</Avatar>}
                /*
                    The card has room for about twenty characters and a pod's name is longer than that,
                    so the names are cut — and the tooltip is the only way to read which object this is.
                    Without it two pods of the same deployment look identical on screen.
                */
                title={<Box>
                    {/* One tooltip per line, each showing ITS own full value: the object on top and the
                        container below. Both are cut to fit the card, so both need it.

                        The KIND goes beside the name because Trivy names a report after the owner of
                        the pods it scanned: without it a ReplicaSet and a Pod read identically. */}
                    {/*
                        🔴 ONE LINE EACH, and that is what `noWrap` is for. The card is 280px tall and
                        fixed; with the kind chip beside it the name lost width, wrapped to a third line
                        and pushed the scan date out of the bottom of the card — visible on every
                        workload whose name is long, which is most of them. The chip does not shrink
                        (`flexShrink: 0`): it is short, and it is what tells a controller from a pod.
                        Nothing is lost by clipping, the tooltip carries the whole name.
                    */}
                    {/*
                        🔴 The NAME gets the whole first line, and the chip rides with the CONTAINER.

                        Side by side with the name, the chip took about 70px of the ~190 the line has
                        (avatar and ⋮ eat the rest) and left room for some fourteen characters: two pods
                        of the same deployment came out as the same 'kwirth-pos…', which is precisely
                        what the chip and the tooltip were added to prevent. The container line is
                        short —'postgres', 'controller'— so the chip fits there with room to spare.

                        It still describes the OBJECT and not the container; they share a line, not a
                        meaning, and the one on the left is already a container name.
                    */}
                    <Tooltip title={fullName(props.asset)} placement='top-start'>
                        <Typography variant='body2' noWrap>{shorten(props.asset.name, 20)}</Typography>
                    </Tooltip>
                    <Stack direction='row' alignItems='center' spacing={0.5} sx={{ minWidth: 0 }}>
                        <Tooltip title={props.asset.container || 'no container (workload-level report)'} placement='bottom-start'>
                            <Typography variant='body2' noWrap sx={{ minWidth: 0 }}>{shorten(props.asset.container, 20)}</Typography>
                        </Tooltip>
                        {props.asset.kind && <Chip label={props.asset.kind} size='small' variant='outlined' sx={{ height: 16, fontSize: '0.6rem', flexShrink: 0 }} />}
                    </Stack>
                </Box>}
                action={<IconButton onClick={(event) => setAnchorMenu(event?.currentTarget)}><MoreVert /></IconButton>}
            />
            <CardMedia>{simpleBarChart(props.asset)}</CardMedia>
            <CardContent sx={{ borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: 'divider' }}>
                <Stack direction='row'><Divider /><Stack direction='column' sx={{ flex: 1 }}>
                    <Typography variant='body2'><b>Date:&nbsp;</b>{props.asset.vulnerabilityreports?.report?.updateTimestamp || props.asset.configauditreports?.report?.updateTimestamp}</Typography>
                </Stack></Stack>
            </CardContent>
        </Card>
        {anchorMenu && assetMenu}
    </>)

    if (props.mode === 'list') return (<>
        <Card sx={{ width: '100%' }}>
            <Stack direction='row' alignItems='center'>
                <Stack direction='row' width='50%' p={1} alignItems='center'>
                    <Avatar sx={{ background: assetAvatarColor(props.asset.vulnerabilityreports?.report?.os?.family || 'X') }}>{getAvatarContent(props.asset.vulnerabilityreports?.report?.os?.family || 'X')}</Avatar>
                    <Stack direction='column' ml={1}>
                        {/* The same two things as the card: the full name on hover, and the kind, which
                            is what tells a controller from a pod. */}
                        <Stack direction='row' alignItems='center' spacing={0.5}>
                            <Tooltip title={fullName(props.asset)} placement='top-start'>
                                <Typography variant='body2'><b>{`${shorten(props.asset.name, 20)}/${shorten(props.asset.container, 10)}`}</b></Typography>
                            </Tooltip>
                            {props.asset.kind && <Chip label={props.asset.kind} size='small' variant='outlined' sx={{ height: 16, fontSize: '0.6rem' }} />}
                        </Stack>
                        <Typography variant='body2'>{`${props.asset.vulnerabilityreports?.report?.updateTimestamp || props.asset.configauditreports?.report?.updateTimestamp}`}</Typography>
                    </Stack>
                </Stack>
                {[TRIVY_API_VULN_PLURAL, TRIVY_API_AUDIT_PLURAL, TRIVY_API_EXPOSED_PLURAL].map((plural, i) => (
                    <Stack key={i} direction='column' sx={{ width: '10%' }} alignItems='center'>
                        <Typography sx={{ fontSize: '1.125rem' }}>{getTotalIssues(plural, props.asset)}</Typography>
                        <Typography variant='caption' sx={{ fontSize: '0.5rem' }}>{['Vulnerabilities', 'ConfigAudit', 'ExposedSecrets'][i]}</Typography>
                    </Stack>
                ))}
                <Typography sx={{ flex: 1 }} />
                <IconButton onClick={(event) => setAnchorMenu(event.currentTarget)}><MoreVert /></IconButton>
            </Stack>
        </Card>
        {anchorMenu && assetMenu}
    </>)

    return <></>
}

export { TrivyTabContentAsset }
