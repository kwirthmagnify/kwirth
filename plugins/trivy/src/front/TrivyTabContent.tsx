import React, { useEffect, useRef, useState, useMemo } from 'react'
import { Box, Button, Stack, Typography, TextField, InputAdornment, Card, ToggleButton, ToggleButtonGroup, Tooltip, useTheme } from '@mui/material'
import { keyReaches } from '../common/TrivyTypes'
import { Search as SearchIcon } from '@mui/icons-material'
import { TReportType } from './TrivyCommon'
import { IContentProps, MsgBoxOk, MsgBoxOkError, MsgBoxWaitCancel } from '@kwirthmagnify/kwirth-common-front'
import { IAsset, ITrivyData, TRIVY_API_AUDIT_PLURAL, TRIVY_API_EXPOSED_PLURAL, TRIVY_API_SBOM_PLURAL, TRIVY_API_VULN_PLURAL } from './TrivyData'
import { TrivyTabContentAssetDetails } from './components/TrivyTabContentAssetDetails'
import { getTotalIssues, TrivyTabContentAsset } from './components/TrivyTabContentAsset'
import { MenuOrder } from './components/MenuOrder'
import { TrivyOperator } from './TrivyOperator'

const addGetAuthorization = (accessString: string) => ({ headers: { 'Authorization': 'Bearer ' + accessString } })

const TrivyTabContent: React.FC<IContentProps> = (props: IContentProps) => {
    const theme = useTheme()
    let trivyData: ITrivyData = props.channelObject.data
    const trivyBoxRef = useRef<HTMLDivElement | null>(null)
    const [trivyBoxTop, setTrivyBoxTop] = useState(0)
    const [showMode, setShowMode] = useState<'list' | 'card'>(trivyData.mode)
    const [selectedType, setSelectedType] = useState<TReportType>(TRIVY_API_VULN_PLURAL)
    const [selectedAsset, setSelectedAsset] = useState<IAsset>()
    const [anchorMenu, setAnchorMenu] = useState<Element | undefined>(undefined)
    const [orderType, setOrderType] = useState<'a' | 'd'>('d')
    const [orderSource, setOrderSource] = useState<'vuln' | 'audit' | 'exposed'>('vuln')
    const [assetList, setAssetList] = useState<IAsset[]>(trivyData.assets)
    const [filterText, setFilterText] = useState('')
    const [showOperatorManage, setShowOperatorManage] = useState<boolean>(false)
    // The front asks the same question the back will ask; the back is what decides.
    const mayManage = keyReaches(props.channelObject.accessString?.split('|')[2] ?? '', 'admin')
    const [msgBox, setMsgBox] = useState<React.ReactNode>(<></>)

    useEffect(() => {
        if (trivyBoxRef.current) {
            const timer = setTimeout(() => { setTrivyBoxTop(trivyBoxRef.current?.getBoundingClientRect().top || 0) }, 100)
            return () => clearTimeout(timer)
        }
    }, [assetList, showMode])

    useEffect(() => {
        const sorted = [...trivyData.assets].sort((a, b) => {
            let valA = 0, valB = 0
            if (orderSource === 'vuln') { valA = getTotalIssues(TRIVY_API_VULN_PLURAL, a); valB = getTotalIssues(TRIVY_API_VULN_PLURAL, b) }
            else if (orderSource === 'audit') { valA = getTotalIssues(TRIVY_API_AUDIT_PLURAL, a); valB = getTotalIssues(TRIVY_API_AUDIT_PLURAL, b) }
            else { valA = getTotalIssues(TRIVY_API_EXPOSED_PLURAL, a); valB = getTotalIssues(TRIVY_API_EXPOSED_PLURAL, b) }
            return orderType === 'a' ? valA - valB : valB - valA
        })
        setAssetList(sorted)
    }, [trivyData.assets])

    const onReorder = (source: 'vuln' | 'audit' | 'exposed', type: 'a' | 'd') => {
        setAnchorMenu(undefined); setOrderSource(source); setOrderType(type)
        const sorted = [...assetList].sort((a, b) => {
            let valA = 0, valB = 0
            if (source === 'vuln') { valA = getTotalIssues(TRIVY_API_VULN_PLURAL, a); valB = getTotalIssues(TRIVY_API_VULN_PLURAL, b) }
            else if (source === 'audit') { valA = getTotalIssues(TRIVY_API_AUDIT_PLURAL, a); valB = getTotalIssues(TRIVY_API_AUDIT_PLURAL, b) }
            else { valA = getTotalIssues(TRIVY_API_EXPOSED_PLURAL, a); valB = getTotalIssues(TRIVY_API_EXPOSED_PLURAL, b) }
            return type === 'a' ? valA - valB : valB - valA
        })
        setAssetList(sorted)
    }

    const filteredAssets = assetList.filter(asset => {
        const search = filterText.toLowerCase()
        /*
            🔴 Nothing is assumed to be a string here. Not every asset HAS a container: a
            ConfigAuditReport is written for whatever the operator audits — a Service, an Ingress, a
            Role — and those have none. Since the channel stopped being `resourced` they reach this
            screen too, and `asset.container.toLowerCase()` took the whole tab down with 'Script error'
            the moment anybody typed a letter in the filter.

            The back end defaults these to '' now, but the screen does not depend on that: a field that
            arrives missing must not be able to break a search box.
        */
        const matches = (value?: string) => (value ?? '').toLowerCase().includes(search)
        return !filterText || matches(asset.name) || matches(asset.namespace) || matches(asset.container)
    })

    const rescanAsset = (asset: IAsset) => { setAssetList(prev => prev.filter(a => a.namespace !== asset.namespace || a.name !== asset.name || a.container !== asset.container)) }

    const onOperatorManageClosed = async (action?: string) => {
        setShowOperatorManage(false)
        if (action) {
            setMsgBox(MsgBoxWaitCancel('Manage Trivy', `We are waiting for the action to complete...`, setMsgBox))
            const result = await fetch(`${props.channelObject.clusterUrl}/${trivyData.ri}/channel/trivy/operator?action=${action}`, addGetAuthorization(props.channelObject.accessString!))
            if (result.status === 200)
                setMsgBox(MsgBoxOk('Trivy', `Action '${action}' successfully sent, check results on your cluster.`, setMsgBox))
            else
                setMsgBox(MsgBoxOkError('Trivy', `Trivy action has shown some errors: ${await result.text()}.`, setMsgBox))
        }
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 1, color: 'text.primary' }}>
            {trivyData.started && <>
                <Card variant='outlined' sx={{ p: 1.5, mb: 2, backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#fafafa', borderColor: 'divider' }}>
                    <Stack direction='row' spacing={2} alignItems='center'>
                        <TextField size='small' placeholder='Search asset, ns...' variant='outlined' value={filterText} onChange={(e) => setFilterText(e.target.value)}
                            sx={{ width: '220px', '& .MuiInputBase-root': { height: '32px', fontSize: '0.8rem' } }}
                            InputProps={{ startAdornment: <InputAdornment position='start'><SearchIcon sx={{ fontSize: '1.1rem', color: 'text.secondary' }} /></InputAdornment> }} />
                        <Box sx={{ flex: 1 }} />
                        <Stack direction='row' spacing={1} alignItems='center'>
                            <Button size='small' variant='contained' disableElevation onClick={(event) => setAnchorMenu(event.currentTarget)} sx={{ textTransform: 'none', height: '30px' }}>Order</Button>
                            <ToggleButtonGroup size='small' exclusive value={showMode} onChange={(_, v) => { if (v) { setShowMode(v); trivyData.mode = v } }} sx={{ height: '30px' }}>
                                <ToggleButton value='card' sx={{ textTransform: 'none', px: 1.5 }}>Card</ToggleButton>
                                <ToggleButton value='list' sx={{ textTransform: 'none', px: 1.5 }}>List</ToggleButton>
                            </ToggleButtonGroup>
                            {/*
                                Disabled, with the reason, when the key cannot manage the operator:
                                installing or removing it asks for 'admin' since 0.2.32, and a button
                                that opens a dialog whose every action answers 403 is worse than no
                                button. Visible and disabled rather than hidden — one that comes and
                                goes is one nobody can look for.
                            */}
                            <Tooltip title={mayManage ? '' : "Installing or removing the Trivy Operator requires the 'admin' scope"}>
                                <span>
                                    <Button size='small' variant='outlined' disableElevation onClick={() => setShowOperatorManage(true)} disabled={!trivyData.ri || !mayManage} sx={{ textTransform: 'none', height: '30px' }}>Manage</Button>
                                </span>
                            </Tooltip>
                        </Stack>
                    </Stack>
                </Card>
                <Box ref={trivyBoxRef} sx={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden', width: '100%', flexGrow: 1, height: `calc(100vh - ${trivyBoxTop}px - 25px)` }}>
                    {showMode === 'card' &&
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            {filteredAssets.map((asset, index) => (
                                <Box key={`${asset.name}-${index}`} sx={{ width: { xs: '100%', sm: '48%', md: '32%', lg: '19%' } }}>
                                    <TrivyTabContentAsset asset={asset} channelObject={props.channelObject}
                                        onShowVulns={() => { setSelectedAsset(asset); setSelectedType(TRIVY_API_VULN_PLURAL) }}
                                        onShowAudit={() => { setSelectedAsset(asset); setSelectedType(TRIVY_API_AUDIT_PLURAL) }}
                                        onShowSbom={() => { setSelectedAsset(asset); setSelectedType(TRIVY_API_SBOM_PLURAL) }}
                                        onShowExposed={() => { setSelectedAsset(asset); setSelectedType(TRIVY_API_EXPOSED_PLURAL) }}
                                        onRescan={() => rescanAsset(asset)} mode='card' />
                                </Box>
                            ))}
                        </Box>
                    }
                    {showMode === 'list' &&
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, px: 1 }}>
                            {filteredAssets.map((asset, index) => (
                                <TrivyTabContentAsset key={`${asset.name}-${index}`} asset={asset} channelObject={props.channelObject}
                                    onShowVulns={() => { setSelectedAsset(asset); setSelectedType(TRIVY_API_VULN_PLURAL) }}
                                    onRescan={() => rescanAsset(asset)}
                                    onShowAudit={() => { setSelectedAsset(asset); setSelectedType(TRIVY_API_AUDIT_PLURAL) }}
                                    onShowSbom={() => { setSelectedAsset(asset); setSelectedType(TRIVY_API_SBOM_PLURAL) }}
                                    onShowExposed={() => { setSelectedAsset(asset); setSelectedType(TRIVY_API_EXPOSED_PLURAL) }}
                                    mode={showMode} />
                            ))}
                        </Box>
                    }
                </Box>
            </>}
            {selectedAsset !== undefined && <TrivyTabContentAssetDetails asset={selectedAsset} onClose={() => setSelectedAsset(undefined)} detail={selectedType} />}
            {anchorMenu !== undefined && <MenuOrder anchorParent={anchorMenu} onClose={() => setAnchorMenu(undefined)} onReorder={onReorder} orderSource={orderSource} orderType={orderType} />}
            {showOperatorManage && <TrivyOperator onClose={onOperatorManageClosed} clusterUrl={props.channelObject.clusterUrl!} accessString={props.channelObject.accessString!} channelObject={props.channelObject} />}
            {msgBox}
        </Box>
    )
}

export { TrivyTabContent }
