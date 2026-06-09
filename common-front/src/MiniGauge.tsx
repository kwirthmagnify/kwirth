import React from 'react'

const GAUGE_ZONES = [
    { size: 0.5, fill: '#5BE12C' },
    { size: 0.3, fill: '#F5CD19' },
    { size: 0.2, fill: '#EA4228' },
]
const VW = 100, VH = 58
const GCX = VW / 2, GCY = VH - 4
const G_OUTER = VW * 0.46, G_INNER = G_OUTER * 0.58, G_NEEDLE = G_OUTER * 0.86
const ARC_PATHS = (() => {
    let a = Math.PI
    return GAUGE_ZONES.map(zone => {
        const end = a - zone.size * Math.PI
        const ox1 = GCX + G_OUTER * Math.cos(a),  oy1 = GCY - G_OUTER * Math.sin(a)
        const ox2 = GCX + G_OUTER * Math.cos(end), oy2 = GCY - G_OUTER * Math.sin(end)
        const ix1 = GCX + G_INNER * Math.cos(a),  iy1 = GCY - G_INNER * Math.sin(a)
        const ix2 = GCX + G_INNER * Math.cos(end), iy2 = GCY - G_INNER * Math.sin(end)
        const d = `M ${ox1} ${oy1} A ${G_OUTER} ${G_OUTER} 0 0 1 ${ox2} ${oy2} L ${ix2} ${iy2} A ${G_INNER} ${G_INNER} 0 0 0 ${ix1} ${iy1} Z`
        a = end
        return { d, fill: zone.fill }
    })
})()

const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.75rem',
    lineHeight: 1,
    opacity: 0.6,
    textAlign: 'center',
}

export interface IMiniGaugeProps {
    value: number
    max: number
    label: string
    format?: (v: number) => string
}

export const MiniGauge: React.FC<IMiniGaugeProps> = ({ value, max, label, format }) => {
    const display = format ? format(value) : value.toFixed(1)
    const pct = Math.min(value / (max || 1), 1)
    const na = Math.PI * (1 - pct)
    const nx = GCX + G_NEEDLE * Math.cos(na)
    const ny = GCY - G_NEEDLE * Math.sin(na)
    return (
        <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
            <span style={{ ...labelStyle, marginBottom: 4 }}>{display}</span>
            <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', display: 'block' }}>
                {ARC_PATHS.map((p, i) => <path key={i} d={p.d} fill={p.fill} />)}
                <line x1={GCX} y1={GCY} x2={nx} y2={ny} stroke='currentColor' strokeWidth={2} strokeLinecap='round' />
                <circle cx={GCX} cy={GCY} r={3} fill='currentColor' />
            </svg>
            <span style={{ ...labelStyle, marginTop: 4 }}>{label}</span>
        </div>
    )
}
