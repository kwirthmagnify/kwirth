import { Stack } from '@mui/material'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { IMagnifyData } from '../MagnifyData'
import { IChannelObject } from '../../IChannel'

interface IClusterMetricsProps {
    channelObject: IChannelObject
}

const ClusterMetrics: React.FC<IClusterMetricsProps> = (props:IClusterMetricsProps) => {
    let magnifyData:IMagnifyData = props.channelObject.data as IMagnifyData

    const chartData = [...magnifyData.metricsCluster]
    return <Stack direction={'row'} sx={{height:'200px'}}>
        <ResponsiveContainer>
            <LineChart data={chartData} title='CPU'>
                <CartesianGrid strokeDasharray='3 3'/>
                <XAxis dataKey='timestamp' fontSize={8}/>
                <YAxis fontSize={8}/>
                <Legend/>
                <Line name={'% CPU'} type='monotone' dataKey={'cpuUsage'} dot={false}/>
            </LineChart>
        </ResponsiveContainer>

        <ResponsiveContainer>
            <LineChart data={chartData} title='Memory'>
                <CartesianGrid strokeDasharray='3 3'/>
                <XAxis dataKey='timestamp' fontSize={8}/>
                <YAxis fontSize={8}/>
                <Legend/>
                <Line name={'% Memory'} type='monotone' dataKey={'memoryUsage'} dot={false}/>
            </LineChart>
        </ResponsiveContainer>
        <ResponsiveContainer>
            <LineChart data={chartData} title='Network'>
                <CartesianGrid strokeDasharray='3 3'/>
                <XAxis dataKey='timestamp' fontSize={8}/>
                <YAxis fontSize={8}/>
                <Legend/>
                <Line name={'Tx Mbps'} type='monotone' dataKey={'txmbps'} stroke='#6e5bb8' dot={false}/>
                <Line name={'Rx Mbps'} type='monotone' dataKey={'rxmbps'} stroke='#4a9076' dot={false}/>
            </LineChart>
        </ResponsiveContainer>
        
    </Stack>
}
export { ClusterMetrics }