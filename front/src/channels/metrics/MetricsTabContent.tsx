import { useEffect, useRef, useState } from 'react'
import { IMetricsData, EMetricsEventSeverity } from './MetricsData'
import { Alert, Box, Button, Snackbar } from '@mui/material'
import { IContentProps } from '../IChannel'
import { IMetricsConfig, IMetricsInstanceConfig, IMetricViewConfig, METRICSCOLOURS, MetricsConfig } from './MetricsConfig'
import { Chart, ISample } from './Chart'
import { EInstanceConfigObject, EInstanceConfigView, EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType, EMetricsConfigMode, IInstanceConfig } from '@kwirthmagnify/kwirth-common'

const MetricsTabContent: React.FC<IContentProps> = (props:IContentProps) => {
    let metricsConfig:IMetricsConfig = props.channelObject.config
    let metricsData:IMetricsData = props.channelObject.data
    let metricsInstanceConfig:IMetricsInstanceConfig = props.channelObject.instanceConfig
    const [alertRefresh, setAlertRefresh] = useState(false)
    const [refreshTabContent, setRefreshTabContent] = useState(0)
    const metricsBoxRef = useRef<HTMLDivElement | null>(null)
    const [metricsBoxTop, setMetricsBoxTop] = useState(0)

    useEffect(() => {
        if (metricsBoxRef.current) setMetricsBoxTop(metricsBoxRef.current.getBoundingClientRect().top)
    })

    const onSetMetricDefault = (name:string, mvc: IMetricViewConfig) => {
        if (props.channelObject.updateChannelSettings && props.channelObject.channelSettings) {
            if (!props.channelObject.channelSettings.channelConfig) props.channelObject.channelSettings.channelConfig = new MetricsConfig()
            props.channelObject.channelSettings.channelConfig.metricsDefault[name] = mvc
            props.channelObject.updateChannelSettings(props.channelObject.channelSettings)
        }
    }

    const handleClose = (reason:string, dataMetrics:IMetricsData, event:{ severity:EMetricsEventSeverity, text:string }) => {
        dataMetrics.events = dataMetrics.events.filter(e => e.severity!==event.severity && e.text!==event.text)
        setRefreshTabContent(Math.random())
    }

    const formatMetricsError = (dataMetrics:IMetricsData) => {
        if (!dataMetrics.events || dataMetrics.events.length === 0) return <></>

        return <>
            {dataMetrics.events.map((event,index) => { 
                return (
                    <Snackbar open={true} autoHideDuration={3000} onClose={(e, r) => handleClose(r, dataMetrics, event)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
                        <Alert severity={event.severity} action={<Button onClick={() => { dataMetrics.events.splice(index,1); setAlertRefresh(!alertRefresh)} }>Dismiss</Button>} sx={{alignItems:'center'}}>{event.text}</Alert>
                    </Snackbar>
                )
            })}
        </>
    }

    const onChartRemove = (assetNames:string[], metricName:string) => {
        if (!props.channelObject.webSocket) return
        
        let metricsMessage:IInstanceConfig = {
            channel: 'metrics',
            data: {
                mode: EMetricsConfigMode.STREAM,
                aggregate: metricsInstanceConfig.aggregate,
                interval: metricsInstanceConfig.interval,
                metrics: metricsInstanceConfig.metrics.filter(m => m !== metricName)
            },
            objects: EInstanceConfigObject.PODS,
            accessKey: props.channelObject.accessString!,
            scope: '',
            view: EInstanceConfigView.NONE,
            namespace: '',
            group: '',
            pod: '',
            container: '',
            action: EInstanceMessageAction.MODIFY,
            flow: EInstanceMessageFlow.REQUEST,
            type: EInstanceMessageType.DATA,
            instance: props.channelObject.instanceId
        }
        let payload = JSON.stringify( metricsMessage )
        if (props.channelObject.webSocket) {
            props.channelObject.webSocket.send(payload)

            for (let amv of metricsData.assetMetricsValues) {
                for (let assetName of assetNames) {
                    for (let asset of amv.assets) {
                        if (asset.assetName === assetName) {
                            asset.values = asset.values.filter(v => v.metricName !== metricName)
                        }
                    }
                }
            }
            setRefreshTabContent(Math.random())
        }

    }

    const formatMetrics = () => {
        if (!props.channelObject.metricsList || metricsData.assetMetricsValues.length === 0) {
            return <>{formatMetricsError(metricsData)}</>
        }

        let data:Map<string, Map<string, ISample[]>> = new Map()
        for (let assetMetricsValues of metricsData.assetMetricsValues) {
            var ts = new Date(assetMetricsValues.timestamp)
            var timestamp = ts.getHours().toString().padStart(2,'0')+':'+ts.getMinutes().toString().padStart(2,'0')+':'+ts.getSeconds().toString().padStart(2,'0')
            for (var i=0;i<assetMetricsValues.assets.length;i++) {
                var assetName=assetMetricsValues.assets[i].assetName
                for (var metrics of assetMetricsValues.assets[i].values) {
                    if (!data.has(assetName)) data.set(assetName, new Map())
                    if (!data.get(assetName)?.has(metrics.metricName)) data.get(assetName)?.set(metrics.metricName,[])
                    data.get(assetName)?.get(metrics.metricName)?.push({timestamp, value:metrics.metricValue})
                }
            }   
        }

        let allCharts = []
        if (metricsConfig.merge) {
            let assetNames=Array.from(data.keys())
            let selectedMetrics:string[] = Array.from(new Set(data.get(assetNames[0])!.keys()))


            for (let metric of selectedMetrics) {
                let metricDefinition = props.channelObject.metricsList.get(metric)!
                let series = assetNames.map(assetName => {
                    return data.get(assetName)!.get(metric)!
                })
                allCharts.push(
                    <Chart key={metricDefinition.metric} metricDefinition={metricDefinition} names={assetNames} series={series} colour={'#888'} chartType={metricsConfig.chart} stack={metricsConfig.stack} numSeries={series.length} tooltip={true} labels={true} onSetDefault={onSetMetricDefault} viewConfig={metricsConfig.metricsDefault[metricDefinition.metric] as IMetricViewConfig} onRemove={onChartRemove}
                        configurable={metricsConfig.configurable}
                        height={metricsConfig.lineHeight}
                        compact={metricsConfig.compact}
                        legend={metricsConfig.legend}
                    />
                )
            }

            let rows = []
            for (let i = 0; i < allCharts.length; i += metricsConfig.width) {
                rows.push(allCharts.slice(i, i + metricsConfig.width))
            }
            return (<>
                {formatMetricsError(metricsData)}
                {rows.map((row, index) => (
                    <div key={index} style={{ display: 'flex', justifyContent: 'space-around' }}>
                        {row}
                    </div>
                ))}
            </>)
        }
        else {
            let allCharts = Array.from(data.keys()!).map( (asset, index)  =>  {
                return Array.from(data.get(asset)?.keys()!).map ( metric => {
                    let metricDefinition = props.channelObject.metricsList?.get(metric)!
                    var series = data.get(asset)?.get(metric)!
                    return <Chart key={metricDefinition.metric}
                        colour={METRICSCOLOURS[index]}
                        labels={true}
                        tooltip={true} 
                        names={[asset]}
                        series={[series]}
                        chartType={metricsConfig.chart} 
                        stack={metricsConfig.stack}
                        viewConfig={metricsConfig.metricsDefault[metricDefinition.metric] as IMetricViewConfig} 
                        numSeries={series.length}
                        metricDefinition={metricDefinition} 
                        onRemove={onChartRemove}
                        onSetDefault={onSetMetricDefault} 
                        height={metricsConfig.lineHeight}
                        configurable={metricsConfig.configurable}
                        compact={metricsConfig.compact}
                        legend={metricsConfig.legend}
                    />
                })
            })

            // convert allCharts (an array of charts) into a series of rows of charts
            let rows = []
            for (var resultAsset of allCharts) {
                for (let i = 0; i < resultAsset.length; i += metricsConfig.width) {
                    rows.push(resultAsset.slice(i, i + metricsConfig.width))
                }
            }
            return (<>
                {formatMetricsError(metricsData)}
                {rows.map((row, index) => (
                    <div key={index} style={{ display: 'flex', justifyContent: 'space-around', marginLeft:'8px', marginRight:'8px' }}>
                        {row}
                    </div>
                ))}
            </>)
        }
    }

    return (
        <Box ref={metricsBoxRef} sx={{ display:'flex', flexDirection:'column', overflowY:'auto', overflowX:'hidden', width:'100%', flexGrow:1, height: `calc(100vh - ${metricsBoxTop}px)`}} data-refresh={refreshTabContent}>
            {formatMetrics()}
        </Box>
    )

}
export { MetricsTabContent }