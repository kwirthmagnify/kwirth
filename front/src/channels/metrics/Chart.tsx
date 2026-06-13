import React, { useState } from 'react'
import { Alert, Box, Card, CardContent, CardHeader, Stack, Typography } from '@mui/material'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, Treemap, XAxis, YAxis } from 'recharts'
import { IMetricViewConfig, METRICSCOLOURS } from './MetricsConfig'
import { Tooltip as MUITooltip, IconButton } from '@mui/material'
import { MenuChart, EMenuChartOption, EChartType } from './MenuChart'
import { MoreVert } from '../../tools/KwirthIcons'
import { TreemapNode } from 'recharts/types/util/types'
import { MetricDefinition } from './MetricsTypes'

export interface ISample {
    timestamp:string
    value:number
}

export interface IChartProps {
    metricDefinition: MetricDefinition,
    names: string[]
    series: ISample[][]
    colour: string
    chartType: EChartType
    height: number
    configurable: boolean
    compact: boolean
    legend: boolean
    stack: boolean
    tooltip: boolean
    labels: boolean
    numSeries: number
    viewConfig : IMetricViewConfig
    onSetDefault?: (name:string, mvc: IMetricViewConfig) => void
    onRemove: (assetNames:string[], metricName:string) => void
    onViewConfigChange?: (name:string, mvc: IMetricViewConfig) => void
}

export const Chart: React.FC<IChartProps> = (props:IChartProps) => {
    const [anchorMenuChart, setAnchorMenuChart] = useState<null | HTMLElement>(null)
    const [chartType, setChartType] = useState<EChartType>(props.viewConfig?.chartType? props.viewConfig.chartType : props.chartType)
    const [stack, setStack] = useState<boolean>(props.viewConfig?.stack? props.viewConfig.stack : props.stack)
    const [tooltip, setTooltip] = useState<boolean>(props.viewConfig?.tooltip? props.viewConfig.tooltip : props.tooltip)
    const [labels, setLabels] = useState<boolean>(props.viewConfig?.labels? props.viewConfig.labels : props.labels)
    const [legend, setLegend] = useState<boolean>(props.viewConfig?.legend? props.viewConfig.legend : props.legend)
    const [compact] = useState<boolean>(props.viewConfig?.compact? props.viewConfig.compact : props.compact)

    let result
    let height = props.height
    let dataSummarized:any[]

    const mergeSeries = (names:string[], series:ISample[][]) => {
        // names is an array of names of series
        // series is an array of arrays of samples
        // example:
        //   [default, ingress-nginx]
        //   [  [ {timestamp:'dad',value:1}, {timestamp:'dad',value:2} ], [ {timestamp:'dad',value:4}, {timestamp:'dad',value:0} ]  ]
        if (!names || names.length===0) return []
        let resultSeries = []

        for (var i=0; i<series[0].length; i++) {
            var item: { [key: string]: string|number } = {}
            for (var j=0; j<series.length; j++ ) {
                if (series[j][i]) {
                    item['timestamp'] = series[0][i].timestamp
                    item[names[j]] = series[j][i].value
                }
            }
            resultSeries.push(item)
        }

        // result is:
        // [ 
        //   {timestamp: '09:16:27', default: 0.21, ingress-nginx: 0.93}
        //   {timestamp: '09:16:32', default: 0.5, ingress-nginx: 0.04}
        // ]
        return resultSeries
    }

    const CustomizedContent: React.FC<TreemapNode> = (props) => {
        const { root, depth, x, y, width, height, index, name } = props

        return (
            <g>
                <rect x={x} y={y} width={width} height={height}
                    style={{
                        fill: depth < 2 ? METRICSCOLOURS[Math.floor((index / root.children.length) * 6)] : '#ffffff00',
                        stroke: '#fff',
                        strokeWidth: 2 / (depth + 1e-10),
                        strokeOpacity: 1 / (depth + 1e-10),
                    }}
                />
                {depth === 1 ? (
                    <text x={x + width / 2} y={y + height / 2 + 7} textAnchor="middle" fill="#fff" fontSize={14} fontFamily='Roboto, Helvetica, Arial, sans-serif'>
                    {name}
                    </text>
                ) : null}

            </g>
        )
    }

    const notifyViewConfigChange = (overrides: Partial<IMetricViewConfig>) => {
        props.onViewConfigChange?.(props.metricDefinition.metric, {
            displayName: props.metricDefinition.metric,
            chartType, configurable: props.configurable, compact,
            legend, stack, tooltip, labels,
            ...overrides
        })
    }

    const menuChartOptionSelected = (opt:EMenuChartOption, data:any) => {
        setAnchorMenuChart(null)
        switch (opt) {
            case EMenuChartOption.Stack:
                setStack(!stack)
                notifyViewConfigChange({ stack: !stack })
                break
            case EMenuChartOption.Remove:
                if (props.onRemove) props.onRemove(props.names, props.metricDefinition.metric)
                break
            case EMenuChartOption.Export:
                if (!props.names?.length || !props.series?.length) return

                const headers = ["timestamp", ...props.names]
                const timestamps = props.series[0].map(point => point.timestamp)
                const rows = timestamps.map((timestamp, idx) => {
                    const values = props.series.map(serie => serie[idx]?.value ?? "")
                    return [timestamp, ...values];
                })
                const separator = ",";
                const csvContent = headers.join(separator) + "\n" + rows.map(r => r.join(separator)).join("\n")
                const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" })

                const link = document.createElement("a")
                link.href = URL.createObjectURL(blob)
                link.download = `${props.metricDefinition.metric}.csv`
                link.click()
                break
            case EMenuChartOption.Tooltip:
                setTooltip(!tooltip)
                notifyViewConfigChange({ tooltip: !tooltip })
                break
            case EMenuChartOption.Labels:
                setLabels(!labels)
                notifyViewConfigChange({ labels: !labels })
                break
            case EMenuChartOption.Legend:
                setLegend(!legend)
                notifyViewConfigChange({ legend: !legend })
                break
            case EMenuChartOption.Default:
                if (props.onSetDefault) {
                    props.onSetDefault(props.metricDefinition.metric, {
                        displayName: props.metricDefinition.metric,
                        chartType: chartType,
                        configurable: props.configurable,
                        compact: compact,
                        legend: legend,
                        stack: stack,
                        tooltip: tooltip,
                        labels: labels
                    })
                }
                break
            default:
                setChartType(data as EChartType)
                notifyViewConfigChange({ chartType: data as EChartType })
                break
        }
    }

    const renderLabel = (data:any) => {
        var values:any[] = props.series.map (s => s[data.index])
        var total:number = values.reduce((acc,value) => acc + (value? value.value:0), 0)  //+++ sometimes value is undefined
        return <text x={data.x + data.width/3.5} y={data.y-10}>{total.toPrecision(3).replace(/0+$/, '').replace(/\.+$/, '')}</text>
    }

    switch (chartType) {
        case EChartType.LineChart:
            result = (
                <LineChart data={mergeSeries(props.names, props.series)}>
                    <CartesianGrid strokeDasharray='3 3'/>
                    <XAxis dataKey='timestamp' fontSize={8}/>
                    <YAxis/>
                    { tooltip && <Tooltip /> }
                    { legend && <Legend wrapperStyle={{ maxHeight: '60px', overflowY: 'auto', fontSize: '12px'}}/> }
                    { props.series.map ((_serie,index) => <Line key={index} name={props.names[index]} type='monotone' dataKey={props.names[index]} stroke={props.series.length===1?props.colour:METRICSCOLOURS[index]} activeDot={{ r: 8 }} />) }
                </LineChart>
            )
            break
        case EChartType.AreaChart:
            result = (
                <AreaChart data={mergeSeries(props.names, props.series)}>
                    <defs>
                        {
                            props.series.map( (_serie,index) => {
                                return (
                                    <linearGradient key={index} id={`color${props.series.length===1?props.colour:METRICSCOLOURS[index]}`} x1='0' y1='0' x2='0' y2='1'>
                                        <stop offset='7%' stopColor={props.series.length===1?props.colour:METRICSCOLOURS[index]} stopOpacity={0.8}/>
                                        <stop offset='93%' stopColor={props.series.length===1?props.colour:METRICSCOLOURS[index]} stopOpacity={0}/>
                                    </linearGradient>
                                )
                            })
                        }
                    </defs>
                    <CartesianGrid strokeDasharray='3 3'/>
                    <XAxis dataKey='timestamp' fontSize={8}/>
                    <YAxis />
                    { tooltip && <Tooltip /> }
                    { legend && <Legend wrapperStyle={{ maxHeight: '60px', overflowY: 'auto', fontSize: '12px'}}/> }
                    { props.series.map ((_serie,index) => 
                        <Area key={index} name={props.names[index]} type='monotone' {...(stack? {stackId:'1'}:{})} dataKey={props.names[index]} stroke={props.series.length===1?props.colour:METRICSCOLOURS[index]} fill={`url(#color${props.series.length===1?props.colour:METRICSCOLOURS[index]})`}/> )
                    }
                </AreaChart>
            )
            break
        case EChartType.BarChart:
            result = (
                <BarChart data={mergeSeries(props.names, props.series)}>
                    <CartesianGrid strokeDasharray='3 3'/>
                    <XAxis dataKey='timestamp' fontSize={8}/>
                    <YAxis />
                    { tooltip && <Tooltip /> }
                    { legend && <Legend wrapperStyle={{ maxHeight: '60px', overflowY: 'auto', fontSize: '12px'}}/> }
                    { props.series.map ((serie,index) =>
                        <Bar key={index} name={props.names[index]} {...(stack? {stackId:'1'}:{})} dataKey={props.names[index]} stroke={props.series.length===1?props.colour:METRICSCOLOURS[index]} fill={props.series.length===1?props.colour:METRICSCOLOURS[index]}>
                            { index === props.series.length-1 && props.series.length > 1 && labels ? <LabelList dataKey={props.names[index]} position='insideTop' content={renderLabel}/> : null }
                        </Bar>
                    )}
                </BarChart>
            )
            break
        case EChartType.PieChart:
            dataSummarized= props.names.map( (name,index) => {
                return { name, value:(props.series[index] as ISample[]).reduce((ac,val) => ac+val.value,0)}
            })
            result = (
                <PieChart>
                    { tooltip && <Tooltip /> }
                    { legend && <Legend wrapperStyle={{ maxHeight: '60px', overflowY: 'auto', fontSize: '12px'}}/>}
                    <Pie key={'asd'} data={dataSummarized} dataKey={'value'} fill={METRICSCOLOURS[0]} innerRadius={0} outerRadius={90}>
                        {dataSummarized.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={METRICSCOLOURS[index % METRICSCOLOURS.length]} />
                        ))}
                    </Pie>
                </PieChart>
            )
            break
        case EChartType.ValueChart:
            result = (
                <div style={{height:height*0.8, alignItems:'center', justifyContent:'center', display:'flex', width:'100%'}}>
                    <Stack direction={'row'} alignItems={'center'} justifyContent={'center'} spacing={2} sx={{ flexWrap: 'wrap', width:'100%'}}>
                        { props.series.map( (serie,index) => {
                            let value = serie[serie.length-1].value
                            let valueStr = '0'
                            if (value) {
                                valueStr = value.toFixed(3)
                                if (value>10) valueStr=value.toFixed(2)
                                if (value>100) valueStr=value.toFixed(1)
                                if (value>1000) valueStr=value.toFixed(0)
                            }

                            return (
                                <Stack key={index} direction={'column'} alignItems={'center'} flex={1} sx={{ height: height }}>
                                    <Box sx={{ height: '90%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                                        <Typography mt={2} textAlign={'center'} fontSize={Math.min(48, 192/props.series.length)} color={props.series.length===1?props.colour:METRICSCOLOURS[index]}>
                                            {valueStr}
                                        </Typography>
                                    </Box>
                                    <Box sx={{ height: '10%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                                        <Typography textAlign={'center'} fontSize={12} color={props.series.length===1?props.colour:METRICSCOLOURS[index]} sx={{ maxHeight: '60px', overflowY: 'auto', fontSize: '12px'}}>
                                            {props.names[index]}
                                        </Typography>
                                    </Box>
                                </Stack>
                            )
                        })}
                    </Stack>
                </div>
            )
            break
        case EChartType.TreemapChart:
            dataSummarized = props.names.map( (name,index) => {
                return { name, value:(props.series[index] as ISample[]).reduce((ac,val) => ac+val.value,0)}
            })
            result = (
                <div style={{paddingLeft:'0px', height:'100%', alignItems:'center', justifyContent:'center', display:'flex'}}>
                    <ResponsiveContainer width='100%'>
                        <Treemap data={dataSummarized} dataKey='value' nameKey='name' aspectRatio={4 / 3} stroke="#ffffff" fill="#6e5bb8" content={React.createElement(CustomizedContent)}>
                            { tooltip && <Tooltip /> }
                        </Treemap>
                    </ResponsiveContainer>
                </div>
            )
            break
        default:
            result = <Alert severity='error'>Unsupported chart type '{chartType}'</Alert>
            break
    }

    let title = props.metricDefinition.metric.replaceAll('_',' ')
    title = title[0].toLocaleUpperCase()+ title.substring(1)
    title = title.replaceAll('cpu', 'CPU')
    title = title.replaceAll(' fs ', ' FS ')
    title = title.replaceAll(' io ', ' IO ')
    title = title.replaceAll('oom', 'OOM')
    title = title.replaceAll('nvm', 'NVM')
    title = title.replaceAll('rss', 'RSS')
    title = title.replaceAll('failcnt', 'fail count')
    title = title.replaceAll('mbps', 'Mbps')

    return (
        <Card sx={{margin:compact?'3px':'6px', width:'100%'}}>
            <CardHeader sx={{border:0, borderBottom:1, borderStyle:'solid', borderColor: 'divider', backgroundColor:'background.default', height:compact?'0px':'24px'}} title= {
                <Stack direction={'column'} alignItems={'center'}>
                    <Stack direction={'row'} alignItems={'center'}>
                        <MUITooltip key={'tooltip'+props.metricDefinition.metric+JSON.stringify(props.names)} title={<Typography style={{fontSize:12}}><b>{props.metricDefinition.metric}</b><br/><br/>{props.metricDefinition.help}</Typography>}>
                                <Typography width='100%' fontSize={compact?'10px':'16px'}>{title.length>40?title.substring(0,40)+'...':title}</Typography>
                        </MUITooltip>
                        { props.configurable && <>
                            <IconButton onClick={(event) => setAnchorMenuChart(event.currentTarget)}><MoreVert fontSize='small'/></IconButton>
                            { anchorMenuChart && <MenuChart onClose={() => setAnchorMenuChart(null)} onOptionSelected={menuChartOptionSelected} anchorMenu={anchorMenuChart} selected={chartType} stacked={stack} tooltip={tooltip} labels={labels} legend={legend} numSeries={props.numSeries} setDefault/>}
                        </>}                        
                    </Stack>
                </Stack>
            } />
            <CardContent sx={{backgroundColor:'background.paper'}}>
                <Stack direction='column' alignItems='center'>
                    <div style={{width:'100%'}}>
                        <ResponsiveContainer height={height} key={props.metricDefinition.metric+JSON.stringify(props.names)}>
                            {result}
                        </ResponsiveContainer>
                    </div>
                </Stack>
            </CardContent>
        </Card>
    )
}
