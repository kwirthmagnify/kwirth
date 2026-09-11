import React, { useEffect, useRef, useState } from 'react'
import { Box, Card, CardContent, Chip, Stack, Typography, useTheme } from '@mui/material'
import { IContentProps } from '@kwirthmagnify/kwirth-common-front'
import {
    CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts'
import { ESugarlessStatus, ISugarlessData, lastSample } from './SugarlessData'
import { trendArrow } from '../common/SugarlessTypes'

const clockTime = (epoch: number): string =>
    new Date(epoch).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

interface IEmptyStateProps {
    title: string
    detail: string
}

/*
    Los cuatro estados sin curva son distintos y el usuario tiene que poder separarlos SIN abrir un
    log: "no hay credenciales" lo arregla un administrador, "esperando la primera lectura" se arregla
    solo, "el movil no ha sincronizado" no es una averia, y un error de verdad hay que leerlo.
*/
const EmptyState: React.FC<IEmptyStateProps> = ({ title, detail }) => (
    <Stack alignItems='center' justifyContent='center' spacing={1} sx={{ height: '100%', px: 4, textAlign: 'center' }}>
        <Typography variant='h6' color='text.secondary'>{title}</Typography>
        <Typography variant='body2' color='text.secondary'>{detail}</Typography>
    </Stack>
)

export const SugarlessTabContent: React.FC<IContentProps> = (props: IContentProps) => {
    const data: ISugarlessData = props.channelObject.data
    const theme = useTheme()
    const boxRef = useRef<HTMLDivElement | null>(null)
    const [boxTop, setBoxTop] = useState(0)

    // Alto dinamico: se mide donde empieza el contenido y se le da el resto de la ventana. El
    // ResizeObserver es lo que mantiene la grafica bien al cambiar el tamaño, no solo al montar.
    useEffect(() => {
        const measure = () => { if (boxRef.current) setBoxTop(boxRef.current.getBoundingClientRect().top) }
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(document.body)
        return () => observer.disconnect()
    }, [])

    const latest = lastSample(data)

    const emptyState = (): React.ReactNode => {
        switch (data.status) {
            case ESugarlessStatus.NOT_CONFIGURED:
                return <EmptyState title='Not configured yet'
                    detail={data.statusMessage} />
            case ESugarlessStatus.NO_DATA:
                return <EmptyState title='No current reading'
                    detail={`${data.statusMessage} This is not a failure: LibreLinkUp reports what the patient device has uploaded, so a phone that has not synced recently yields no value.`} />
            case ESugarlessStatus.ERROR:
                return <EmptyState title='Something needs fixing' detail={data.statusMessage} />
            default:
                return <EmptyState title='Waiting for the first reading'
                    detail='The sensor produces a value roughly every 15 minutes, so the first point can take a while to show up.' />
        }
    }

    // El dominio vertical tiene que abarcar las lecturas Y la banda objetivo: si no, el dia que todas
    // las muestras caen dentro del rango, la banda se sale del grafico y no se ve.
    const values = data.samples.map(s => s.value)
    const candidates = [...values, ...(data.targetLow !== undefined ? [data.targetLow] : []), ...(data.targetHigh !== undefined ? [data.targetHigh] : [])]
    const minimum = candidates.length > 0 ? Math.min(...candidates) : 0
    const maximum = candidates.length > 0 ? Math.max(...candidates) : 100
    const padding = Math.max(10, (maximum - minimum) * 0.15)

    const valueColor = (): string => {
        if (!latest) return theme.palette.text.primary
        if (latest.isHigh) return theme.palette.warning.main
        if (latest.isLow) return theme.palette.error.main
        return theme.palette.success.main
    }

    return (
        <Card sx={{ flex: 1, width: '98%', alignSelf: 'center', m: 1 }}>
            <CardContent>
                <Stack direction='row' alignItems='baseline' spacing={2} sx={{ mb: 1, flexWrap: 'wrap' }}>
                    <Typography variant='h3' sx={{ color: valueColor(), lineHeight: 1 }}>
                        {latest ? latest.value : '--'}
                    </Typography>
                    <Typography variant='h6' color='text.secondary'>{data.unit}</Typography>
                    {latest && <Typography variant='h4' sx={{ color: valueColor(), lineHeight: 1 }}>{trendArrow(latest.trend)}</Typography>}
                    {latest && <Typography variant='body2' color='text.secondary'>at {clockTime(latest.timestamp)}</Typography>}
                    {data.targetLow !== undefined && data.targetHigh !== undefined &&
                        <Chip size='small' variant='outlined' label={`target ${data.targetLow}–${data.targetHigh}`} />}
                    {data.paused && <Chip size='small' color='warning' label='paused' />}
                    <Typography variant='body2' color='text.secondary'>{data.samples.length} reading(s)</Typography>
                </Stack>

                <Box ref={boxRef} sx={{ height: `calc(100vh - ${boxTop}px - 35px)`, minHeight: 220 }}>
                    {data.samples.length === 0
                        ? emptyState()
                        : <ResponsiveContainer width='100%' height='100%'>
                            <LineChart data={data.samples} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                                <CartesianGrid strokeDasharray='3 3' stroke={theme.palette.divider} />
                                {data.targetLow !== undefined && data.targetHigh !== undefined &&
                                    <ReferenceArea y1={data.targetLow} y2={data.targetHigh}
                                        fill={theme.palette.success.main} fillOpacity={0.12} strokeOpacity={0} />}
                                <XAxis dataKey='timestamp' type='number' scale='time'
                                    domain={['dataMin', 'dataMax']}
                                    tickFormatter={clockTime}
                                    stroke={theme.palette.text.secondary} fontSize={12} />
                                <YAxis domain={[Math.floor(minimum - padding), Math.ceil(maximum + padding)]}
                                    stroke={theme.palette.text.secondary} fontSize={12} width={45} />
                                <Tooltip
                                    labelFormatter={(label: number) => new Date(label).toLocaleString()}
                                    formatter={(value: number) => [`${value} ${data.unit}`, 'glucose']} />
                                <Line type='monotone' dataKey='value' dot={{ r: 2 }} activeDot={{ r: 5 }}
                                    stroke={theme.palette.primary.main} strokeWidth={2} isAnimationActive={false} />
                            </LineChart>
                        </ResponsiveContainer>}
                </Box>
            </CardContent>
        </Card>
    )
}
