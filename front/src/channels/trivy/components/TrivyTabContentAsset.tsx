import { Avatar, Box, Card, CardContent, CardHeader, CardMedia, Divider, IconButton, Menu, MenuItem, MenuList, Stack, Typography } from '@mui/material'
import { MoreVert } from '@mui/icons-material'
import { Visibility as VisibilityIcon } from '@mui/icons-material'
import { Replay as ReplayIcon } from '@mui/icons-material'
import { assetAvatarColor, getAvatarContent } from '../TrivyCommon'
import { useState } from 'react'
import { IChannelObject } from '../../IChannel'
import { ITrivyInstanceConfig } from '../TrivyConfig'
import { EInstanceMessageAction, EInstanceMessageChannel, EInstanceMessageFlow, EInstanceMessageType } from '@kwirthmagnify/kwirth-common'
import { ETrivyCommand, IAsset, ITrivyMessage, TRIVY_API_AUDIT_PLURAL, TRIVY_API_EXPOSED_PLURAL, TRIVY_API_VULN_PLURAL } from '../TrivyData'

interface ITrivyTabContentAssetProps {
    asset: IAsset
    channelObject: IChannelObject
    mode: 'list'|'card'
    onShowVulns: (asset:IAsset) => void
    onShowAudit: (asset:IAsset) => void
    onShowExposed: (asset:IAsset) => void
    onShowSbom: (asset:IAsset) => void
    onRescan: (asset:IAsset) => void
}

export const getTotalIssues = (trivyInstanceConfig: ITrivyInstanceConfig, plural:string, asset:IAsset) => {
    let sum = (asset as any)[plural]?.report?.summary
    let c = trivyInstanceConfig.ignoreCritical? 0 : sum?.criticalCount
    let h = trivyInstanceConfig.ignoreHigh? 0 : sum?.highCount
    let m = trivyInstanceConfig.ignoreMedium? 0 : sum?.mediumCount
    let l = trivyInstanceConfig.ignoreLow? 0 : sum?.lowCount
    return (c + h + m + l) || 0
}

const simpleBarChart = (asset: IAsset, trivyInstanceConfig: ITrivyInstanceConfig) => {
    const reportSbom = asset.sbomreports.report
    const vulns = getTotalIssues(trivyInstanceConfig, TRIVY_API_VULN_PLURAL, asset)
    const audit = getTotalIssues(trivyInstanceConfig, TRIVY_API_AUDIT_PLURAL, asset)
    const exposed = getTotalIssues(trivyInstanceConfig, TRIVY_API_EXPOSED_PLURAL, asset)
    const sbom = (reportSbom?.components?.components?.length) || 0
    
    const maxHeightPx = 100
    const maxDataValue = Math.max(vulns, audit, sbom, exposed, 1)

    const calculateHeight = (value: number) => {
        return (value / maxDataValue) * maxHeightPx
    }

    const bars = [
        { label: `Vulns`, value: vulns, height: calculateHeight(vulns), color: '#d32f2f' },
        { label: `Audit`, value: audit, height: calculateHeight(audit), color: '#d32f2f' },
        { label: `Exposed`, value: exposed, height: calculateHeight(exposed), color: '#d32f2f' },
        { label: `SBOM`, value: sbom, height: calculateHeight(sbom), color: '#388e3c' },
    ]

    return (
        <Box display='flex' alignItems='flex-end' justifyContent='space-around' height={maxHeightPx + 40} width='100%' padding={1} bgcolor='background.paper'>
            {bars.map((bar, index) => (
                <Box key={index} textAlign='center' sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Typography variant='caption' sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>{bar.value}</Typography>                    
                    <Box width={30} height={bar.height} bgcolor={bar.color} marginX={1} sx={{ transition: 'height 0.3s ease', borderRadius: '2px 2px 0 0' }}/>                    
                    <Typography variant='caption' sx={{ fontSize: '0.65rem' }}>{bar.label}</Typography>
                </Box>
            ))}
        </Box>
    )
}

const TrivyTabContentAsset: React.FC<ITrivyTabContentAssetProps> = (props:ITrivyTabContentAssetProps) => {
    let trivyInstanceConfig:ITrivyInstanceConfig = props.channelObject.instanceConfig
    const [anchorMenu, setAnchorMenu] = useState<HTMLElement|undefined>(undefined)

    const rescan = (asset:IAsset) => {
        if (props.channelObject.webSocket) {
            let trivyMessage: ITrivyMessage = {
                msgtype: 'trivymessage',
                id: '1',
                accessKey: props.channelObject.accessString!,
                instance: props.channelObject.instanceId,
                namespace: asset.namespace,
                group: '',
                pod: asset.name,
                container: asset.container,
                command: ETrivyCommand.RESCAN,
                action: EInstanceMessageAction.COMMAND,
                flow: EInstanceMessageFlow.REQUEST,
                type: EInstanceMessageType.DATA,
                channel: EInstanceMessageChannel.TRIVY
            }
            props.channelObject.webSocket.send(JSON.stringify(trivyMessage))
            props.onRescan(asset)
        }
    }

    let assetMenu = (
        <Menu anchorEl={anchorMenu} open={Boolean(anchorMenu)} onClose={() => setAnchorMenu(undefined)}>
            <MenuList dense sx={{width:'200px'}}>
                <MenuItem onClick={() => { setAnchorMenu(undefined); props.onShowVulns(props.asset)}} disabled={!props.asset.vulnerabilityreports.report || getTotalIssues(trivyInstanceConfig, TRIVY_API_VULN_PLURAL, props.asset)===0}><VisibilityIcon/>&nbsp;&nbsp;Vulnerabilities</MenuItem>
                <MenuItem onClick={() => { setAnchorMenu(undefined); props.onShowAudit(props.asset)}} disabled={!props.asset.configauditreports.report || getTotalIssues(trivyInstanceConfig, TRIVY_API_AUDIT_PLURAL, props.asset)===0}><VisibilityIcon/>&nbsp;&nbsp;Config audit</MenuItem>
                <MenuItem onClick={() => { setAnchorMenu(undefined); props.onShowExposed(props.asset)}} disabled={!props.asset.exposedsecretreports.report || getTotalIssues(trivyInstanceConfig, TRIVY_API_EXPOSED_PLURAL, props.asset)===0}><VisibilityIcon/>&nbsp;&nbsp;Exposed secrets</MenuItem>
                <MenuItem onClick={() => { setAnchorMenu(undefined); props.onShowSbom(props.asset)}} disabled={!props.asset.sbomreports.report}><VisibilityIcon/>&nbsp;&nbsp;SBOM</MenuItem>
                <MenuItem onClick={() => { setAnchorMenu(undefined); rescan(props.asset)}}><ReplayIcon/>&nbsp;&nbsp;Re-scan</MenuItem>
            </MenuList>
        </Menu>
    )
    
    if (props.mode === 'card') return (<>
        <Card sx={{width:'100%', height:'280px', borderWidth: '1px', borderStyle:'solid', borderColor:'divider'}}>
            <CardHeader
                avatar={<Avatar sx={{background: assetAvatarColor(props.asset.vulnerabilityreports?.report?.os?.family||'X')}}>{getAvatarContent(props.asset.vulnerabilityreports?.report?.os?.family||'X')}</Avatar>}
                title={<>
                    <Typography variant='body2' color='textPrimary'>{`${props.asset.name?.substring(0,20)}...`}</Typography>
                    <Typography variant='body2' color='textPrimary'>{`${props.asset.container?.substring(0,20)||'NA'}...`}</Typography>
                </>}
                action={<IconButton onClick={(event) => setAnchorMenu(event?.currentTarget)}><MoreVert/></IconButton>}
            />
            <CardMedia>
                {simpleBarChart(props.asset, trivyInstanceConfig)}
            </CardMedia>
            <CardContent sx={{borderTopWidth: '1px', borderTopStyle:'solid', borderTopColor:'divider'}}>
                <Stack direction='row'>
                    <Divider/>
                    <Stack direction='column' sx={{flex:1}}>
                        <Typography variant='body2'><b>Date:&nbsp;</b>{props.asset.vulnerabilityreports?.report?.updateTimestamp || props.asset.configauditreports?.report?.updateTimestamp}</Typography>
                    </Stack>
                </Stack>
            </CardContent>
        </Card>
        { anchorMenu && assetMenu }
    </>)

    if (props.mode === 'list') return (<>
        <Card sx={{width:'100%'}}>
            <Stack direction={'row'} alignItems={'center'}>
                <Stack direction={'row'} width={'50%'} p={1}  alignItems={'center'}>
                    <Avatar sx={{background: assetAvatarColor(props.asset.vulnerabilityreports?.report?.os?.family||'X')}}>{getAvatarContent(props.asset.vulnerabilityreports?.report?.os?.family||'X')}</Avatar>
                    <Stack direction={'column'} ml={1}>
                        <Typography variant='body2'><b>{`${props.asset.name.substring(0.20)}.../${props.asset.container.substring(0,10)}...`}</b></Typography>
                        <Typography variant='body2'>{`${props.asset.vulnerabilityreports?.report?.updateTimestamp || props.asset.configauditreports?.report?.updateTimestamp}`}</Typography>                        
                    </Stack>
                </Stack>
                <Stack direction={'column'} sx={{width:'10%'}} alignItems={'center'}>
                    <Typography fontSize={'18px'}>{getTotalIssues(trivyInstanceConfig, TRIVY_API_VULN_PLURAL, props.asset)}</Typography>
                    <Typography fontSize={'8px'}>Vulnerabilities</Typography>
                </Stack>
                <Stack direction={'column'} sx={{width:'10%'}} alignItems={'center'}>
                    <Typography fontSize={'18px'}>{getTotalIssues(trivyInstanceConfig, TRIVY_API_AUDIT_PLURAL, props.asset)}</Typography>
                    <Typography fontSize={'8px'}>ConfigAudit</Typography>
                </Stack>
                <Stack direction={'column'} sx={{width:'10%'}} alignItems={'center'}>
                    <Typography fontSize={'18px'}>{getTotalIssues(trivyInstanceConfig, TRIVY_API_EXPOSED_PLURAL, props.asset)}</Typography>
                    <Typography fontSize={'8px'}>ExposedSecrets</Typography>
                </Stack>
                <Typography sx={{flex:1}}></Typography>
                <IconButton onClick={(event) => setAnchorMenu(event.currentTarget)}><MoreVert/></IconButton>
            </Stack>
        </Card>
        { anchorMenu && assetMenu }
    </>)

    return <></>
}

export { TrivyTabContentAsset }