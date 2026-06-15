import React from 'react'

const GAUGE_ZONES = [
    { size: 0.5, fill: '#5BE12C' },
    { size: 0.3, fill: '#F5CD19' },
    { size: 0.2, fill: '#EA4228' },
]
// Arc geometry (same for both modes)
const VW = 100
const GCX = VW / 2
const G_OUTER = VW * 0.46, G_INNER = G_OUTER * 0.58, G_NEEDLE = G_OUTER * 0.86
// 'above': extra 14px header above arc + 14px footer for label
// 'inside': no header, 14px footer for label
const HEADER_ABOVE = 14, FOOTER = 14
const GCY_ABOVE = G_OUTER + HEADER_ABOVE        // arc center when value is above
const GCY_INSIDE = G_OUTER + 4                  // arc center when value is inside (tight top)
const VH_ABOVE = GCY_ABOVE + 4 + FOOTER         // total SVG height for 'above'
const VH_INSIDE = GCY_INSIDE + 4 + FOOTER       // total SVG height for 'inside'

const buildArcPaths = (gcx: number, gcy: number) => {
    let a = Math.PI
    return GAUGE_ZONES.map(zone => {
        const end = a - zone.size * Math.PI
        const ox1 = gcx + G_OUTER * Math.cos(a),  oy1 = gcy - G_OUTER * Math.sin(a)
        const ox2 = gcx + G_OUTER * Math.cos(end), oy2 = gcy - G_OUTER * Math.sin(end)
        const ix1 = gcx + G_INNER * Math.cos(a),  iy1 = gcy - G_INNER * Math.sin(a)
        const ix2 = gcx + G_INNER * Math.cos(end), iy2 = gcy - G_INNER * Math.sin(end)
        const d = `M ${ox1} ${oy1} A ${G_OUTER} ${G_OUTER} 0 0 1 ${ox2} ${oy2} L ${ix2} ${iy2} A ${G_INNER} ${G_INNER} 0 0 0 ${ix1} ${iy1} Z`
        a = end
        return { d, fill: zone.fill }
    })
}

export interface IMiniGaugeProps {
    value: number
    max: number
    label: string
    format?: (v: number) => string
    valuePosition?: 'above' | 'inside'
}

export const MiniGauge: React.FC<IMiniGaugeProps> = ({ value, max, label, format, valuePosition = 'above' }) => {
    const display = format ? format(value) : value.toFixed(1)
    const pct = Math.min(value / (max || 1), 1)
    const rotateDeg = -(1 - pct) * 180
    const gcy = valuePosition === 'above' ? GCY_ABOVE : GCY_INSIDE
    const vh  = valuePosition === 'above' ? VH_ABOVE  : VH_INSIDE
    const arcPaths = buildArcPaths(GCX, gcy)
    return (
        <div style={{ flex: 1, minWidth: 0 }}>
            <svg viewBox={`0 0 ${VW} ${vh}`} style={{ width: '100%', display: 'block' }}>
                {arcPaths.map((p, i) => <path key={i} d={p.d} fill={p.fill} />)}
                <g transform={`translate(${GCX}, ${gcy})`}>
                    <g style={{ transform: `rotate(${rotateDeg}deg)`, transformOrigin: '0px 0px', transition: 'transform 0.5s ease-out' }}>
                        <line x1={0} y1={0} x2={G_NEEDLE} y2={0} stroke='currentColor' strokeWidth={2} strokeLinecap='round' />
                    </g>
                </g>
                <circle cx={GCX} cy={gcy} r={3} fill='currentColor' />
                {valuePosition === 'above' && (
                    <text x={GCX} y={HEADER_ABOVE - 6} textAnchor='middle' dominantBaseline='auto'
                        style={{ fontSize: '12px', fill: 'currentColor', opacity: 0.85 }}>
                        {display}
                    </text>
                )}
                {valuePosition === 'inside' && (
                    <text x={GCX} y={gcy - G_INNER * 0.55} textAnchor='middle' dominantBaseline='middle'
                        style={{ fontSize: '12px', fill: 'currentColor', opacity: 0.85 }}>
                        {display}
                    </text>
                )}
                <text x={GCX} y={vh - 2} textAnchor='middle' dominantBaseline='auto'
                    style={{ fontSize: '11px', fill: 'currentColor', opacity: 0.6 }}>
                    {label}
                </text>
            </svg>
        </div>
    )
}
