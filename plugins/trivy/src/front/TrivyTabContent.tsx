import React, { useEffect, useRef, useState, useMemo } from 'react'
import { Box, Button, Stack, Typography, Slider, TextField, InputAdornment, Card, useTheme } from '@mui/material'
import { Search as SearchIcon } from '@mui/icons-material'
import { TReportType } from './TrivyCommon'
import { IContentProps } from '@kwirthmagnify/kwirth-common-front'
import { IAsset, ITrivyData, TRIVY_API_AUDIT_PLURAL, TRIVY_API_EXPOSED_PLURAL, TRIVY_API_SBOM_PLURAL, TRIVY_API_VULN_PLURAL } from './TrivyData'
import { TrivyTabContentAssetDetails } from './components/TrivyTabContentAssetDetails'
import { getTotalIssues, TrivyTabContentAsset } from './components/TrivyTabContentAsset'
import { MenuOrder } from './components/MenuOrder'
import { ITrivyInstanceConfig } from '../common/TrivyTypes'

const TrivyTabContent: React.FC<IContentProps> = (props: IContentProps) => {
    const theme = useTheme()
    let trivyData: ITrivyData = props.channelObject.data
    let trivyInstanceConfig: ITrivyInstanceConfig = props.channelObject.instanceConfig
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
    const [minVulns, setMinVulns] = useState(0)
    const [minAudit, setMinAudit] = useState(0)
    const [minExposed, setMinExposed] = useState(0)

    useEffect(() => {
        if (trivyBoxRef.current) {
            const timer = setTimeout(() => { setTrivyBoxTop(trivyBoxRef.current?.getBoundingClientRect().top || 0) }, 100)
            return () => clearTimeout(timer)
        }
    }, [assetList, showMode])

    useEffect(() => {
        const sorted = [...trivyData.assets].sort((a, b) => {
            let valA = 0, valB = 0
            if (orderSource === 'vuln') { valA = getTotalIssues(trivyInstanceConfig, TRIVY_API_VULN_PLURAL, a); valB = getTotalIssues(trivyInstanceConfig, TRIVY_API_VULN_PLURAL, b) }
            else if (orderSource === 'audit') { valA = getTotalIssues(trivyInstanceConfig, TRIVY_API_AUDIT_PLURAL, a); valB = getTotalIssues(trivyInstanceConfig, TRIVY_API_AUDIT_PLURAL, b) }
            else { valA = getTotalIssues(trivyInstanceConfig, TRIVY_API_EXPOSED_PLURAL, a); valB = getTotalIssues(trivyInstanceConfig, TRIVY_API_EXPOSED_PLURAL, b) }
            return orderType === 'a' ? valA - valB : valB - valA
        })
        setAssetList(sorted)
    }, [trivyData.assets])

    const maxLimits = useMemo(() => {
        const assets = trivyData.assets || []
        return {
            vulns: assets.length > 0 ? Math.max(...assets.map(a => getTotalIssues(trivyInstanceConfig, TRIVY_API_VULN_PLURAL, a))) : 0,
            audit: assets.length > 0 ? Math.max(...assets.map(a => getTotalIssues(trivyInstanceConfig, TRIVY_API_AUDIT_PLURAL, a))) : 0,
            exposed: assets.length > 0 ? Math.max(...assets.map(a => getTotalIssues(trivyInstanceConfig, TRIVY_API_EXPOSED_PLURAL, a))) : 0
        }
    }, [trivyData.assets, trivyInstanceConfig])

    const onReorder = (source: 'vuln' | 'audit' | 'exposed', type: 'a' | 'd') => {
        setAnchorMenu(undefined); setOrderSource(source); setOrderType(type)
        const sorted = [...assetList].sort((a, b) => {
            let valA = 0, valB = 0
            if (source === 'vuln') { valA = getTotalIssues(trivyInstanceConfig, TRIVY_API_VULN_PLURAL, a); valB = getTotalIssues(trivyInstanceConfig, TRIVY_API_VULN_PLURAL, b) }
            else if (source === 'audit') { valA = getTotalIssues(trivyInstanceConfig, TRIVY_API_AUDIT_PLURAL, a); valB = getTotalIssues(trivyInstanceConfig, TRIVY_API_AUDIT_PLURAL, b) }
            else { valA = getTotalIssues(trivyInstanceConfig, TRIVY_API_EXPOSED_PLURAL, a); valB = getTotalIssues(trivyInstanceConfig, TRIVY_API_EXPOSED_PLURAL, b) }
            return type === 'a' ? valA - valB : valB - valA
        })
        setAssetList(sorted)
    }

    const filteredAssets = assetList.filter(asset => {
        const search = filterText.toLowerCase()
        const matchesText = !filterText || asset.name.toLowerCase().includes(search) || asset.namespace.toLowerCase().includes(search) || asset.container.toLowerCase().includes(search)
        const matchesMetrics = getTotalIssues(trivyInstanceConfig, TRIVY_API_VULN_PLURAL, asset) >= minVulns && getTotalIssues(trivyInstanceConfig, TRIVY_API_AUDIT_PLURAL, asset) >= minAudit && getTotalIssues(trivyInstanceConfig, TRIVY_API_EXPOSED_PLURAL, asset) >= minExposed
        return matchesText && matchesMetrics
    })

    const rescanAsset = (asset: IAsset) => { setAssetList(prev => prev.filter(a => a.namespace !== asset.namespace || a.name !== asset.name || a.container !== asset.container)) }

    const sliderStyle = { '& .MuiSlider-valueLabel': { fontSize: '0.65rem', lineHeight: 1.2, width: 20, height: 20, borderRadius: '50% 50% 50% 0', padding: '2px', top: -2 } }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 1, color: 'text.primary' }}>
            {trivyData.started && <>
                <Card variant='outlined' sx={{ p: 1.5, mb: 2, backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#fafafa', borderColor: 'divider' }}>
                    <Stack direction='row' spacing={2} alignItems='center'>
                        <TextField size='small' placeholder='Search asset, ns...' variant='outlined' value={filterText} onChange={(e) => setFilterText(e.target.value)}
                            sx={{ width: '220px', '& .MuiInputBase-root': { height: '32px', fontSize: '0.8rem' } }}
                            InputProps={{ startAdornment: <InputAdornment position='start'><SearchIcon sx={{ fontSize: '1.1rem', color: 'text.secondary' }} /></InputAdornment> }} />
                        {([['Vulns', minVulns, setMinVulns, maxLimits.vulns], ['Audit', minAudit, setMinAudit, maxLimits.audit], ['Exposed', minExposed, setMinExposed, maxLimits.exposed]] as const).map(([label, val, setter, max]) => (
                            <Stack key={label} flexDirection='row' sx={{ width: '150px' }} alignItems='center'>
                                <Typography variant='caption' sx={{ fontSize: '0.7rem', fontWeight: 'bold', mr: 1, color: 'text.secondary' }}>{label}</Typography>
                                <Slider size='small' value={val as number} onChange={(_, v) => (setter as Function)(v as number)} max={max as number} valueLabelDisplay='auto' sx={sliderStyle} />
                                <Typography variant='caption' sx={{ fontSize: '0.7rem', minWidth: '15px', fontWeight: 'bold', ml: 1, color: 'text.primary' }}>{val}</Typography>
                            </Stack>
                        ))}
                        <Box sx={{ flex: 1 }} />
                        <Stack direction='row' spacing={1}>
                            <Button size='small' variant='contained' disableElevation onClick={(event) => setAnchorMenu(event.currentTarget)} sx={{ textTransform: 'none', height: '30px' }}>Order</Button>
                            <Button size='small' variant={showMode === 'list' ? 'contained' : 'outlined'} disableElevation onClick={() => { setShowMode('list'); trivyData.mode = 'list' }} sx={{ textTransform: 'none', height: '30px' }}>List</Button>
                            <Button size='small' variant={showMode === 'card' ? 'contained' : 'outlined'} disableElevation onClick={() => { setShowMode('card'); trivyData.mode = 'card' }} sx={{ textTransform: 'none', height: '30px' }}>Card</Button>
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
            {selectedAsset !== undefined && <TrivyTabContentAssetDetails asset={selectedAsset} trivyInstanceConfig={trivyInstanceConfig} onClose={() => setSelectedAsset(undefined)} detail={selectedType} />}
            {anchorMenu !== undefined && <MenuOrder anchorParent={anchorMenu} onClose={() => setAnchorMenu(undefined)} onReorder={onReorder} orderSource={orderSource} orderType={orderType} />}
        </Box>
    )
}

export { TrivyTabContent }
