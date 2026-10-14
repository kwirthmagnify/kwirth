import React from 'react'

/*
    The background drawn when one of Magnify's top-level sections is open with nothing selected. They were
    seven PNG files (~250 KB inside the plugin, as data URLs); these are line drawings of the same subjects
    in SVG, a few KB in all. They paint with currentColor, so they take the theme's colour instead of being
    grey on white in a dark theme.
*/

// The page's background, for the shapes that must hide the lines behind them. Set by whoever draws these
// (RFMSetup, from the theme), so it is right in both themes.
const BG = 'var(--magnify-section-bg, white)'

const Frame = (props: { label: string, children: React.ReactNode }) => (
    <svg viewBox='0 0 360 400' width='300' height='333' role='img' aria-label={props.label}>
        <g fill='none' stroke='currentColor' strokeWidth='6' strokeLinecap='round' strokeLinejoin='round'>
            {props.children}
        </g>
        <text x='180' y='378' textAnchor='middle' fontFamily='Arial, Helvetica, sans-serif' fontWeight='700' fontSize='30' fill='currentColor'>{props.label}</text>
    </svg>
)

// A small hexagon centred on (cx, cy)
const Hex = (props: { cx: number, cy: number, r?: number }) => {
    const r = props.r ?? 11
    const points = [0, 1, 2, 3, 4, 5].map(i => {
        const a = Math.PI / 6 + i * Math.PI / 3
        return `${(props.cx + r * Math.cos(a)).toFixed(1)},${(props.cy + r * Math.sin(a)).toFixed(1)}`
    }).join(' ')
    return <polygon points={points} />
}

// A gear: a ring with eight teeth
const Gear = (props: { cx: number, cy: number, r: number }) => {
    const { cx, cy, r } = props
    return <g>
        <circle cx={cx} cy={cy} r={r} />
        <circle cx={cx} cy={cy} r={r * 0.4} />
        {[0, 1, 2, 3, 4, 5, 6, 7].map(i => {
            const a = i * Math.PI / 4
            return <line key={i} x1={cx + r * Math.cos(a)} y1={cy + r * Math.sin(a)} x2={cx + (r + r * 0.45) * Math.cos(a)} y2={cy + (r + r * 0.45) * Math.sin(a)} />
        })}
    </g>
}

// An isometric cube centred on (cx, cy), with three lines on its right face
const Cube = (props: { cx: number, cy: number, s: number }) => {
    const { cx, cy, s } = props
    return <g>
        <path d={`M${cx},${cy - s} L${cx + s},${cy - s / 2} L${cx},${cy} L${cx - s},${cy - s / 2} Z`} />
        <path d={`M${cx - s},${cy - s / 2} L${cx - s},${cy + s / 2} L${cx},${cy + s} L${cx},${cy}`} />
        <path d={`M${cx + s},${cy - s / 2} L${cx + s},${cy + s / 2} L${cx},${cy + s}`} />
        {[0, 1, 2].map(i => <line key={i} x1={cx + s * 0.25} y1={cy + s * 0.1 + i * s * 0.22} x2={cx + s * 0.75} y2={cy - s * 0.15 + i * s * 0.22} />)}
    </g>
}

const Workload = () => <Frame label='WORKLOAD'>
    <g fill='currentColor' stroke='none'>
        <rect x='62' y='198' width='34' height='57' rx='3' />
        <rect x='110' y='212' width='34' height='43' rx='3' />
        <rect x='158' y='150' width='34' height='105' rx='3' />
        <rect x='206' y='162' width='34' height='93' rx='3' />
        <rect x='254' y='106' width='34' height='149' rx='3' />
    </g>
    <line x1='52' y1='268' x2='298' y2='268' />
    <circle cx='44' cy='268' r='8' />
    <circle cx='306' cy='268' r='8' />
    <polyline points='70,170 158,100 198,124 282,46' strokeWidth='12' />
    <polyline points='248,44 286,42 284,80' strokeWidth='12' />
    <Gear cx={130} cy={178} r={12} />
</Frame>

const Network = () => <Frame label='NETWORKING'>
    <circle cx='180' cy='165' r='130' />
    <ellipse cx='180' cy='165' rx='130' ry='52' />
    <ellipse cx='180' cy='165' rx='62' ry='130' />
    <ellipse cx='180' cy='165' rx='130' ry='60' transform='rotate(35 180 165)' strokeDasharray='10 10' strokeWidth='3' />
    <ellipse cx='180' cy='165' rx='130' ry='60' transform='rotate(-35 180 165)' strokeDasharray='10 10' strokeWidth='3' />
    {[[50, 165], [310, 165], [180, 35], [180, 295], [242, 98], [136, 175], [210, 222], [262, 52], [100, 78], [292, 222]].map(([x, y], i) =>
        <circle key={i} cx={x} cy={y} r='10' fill={BG} />
    )}
</Frame>

const Security = () => <Frame label='SECURITY'>
    <rect x='34' y='26' width='292' height='254' strokeDasharray='14 10' strokeWidth='4' />
    <Hex cx={34} cy={26} />
    <Hex cx={326} cy={26} />
    <Hex cx={34} cy={280} />
    <Hex cx={326} cy={280} />
    <circle cx='180' cy='26' r='8' />
    <circle cx='180' cy='280' r='8' />
    <circle cx='34' cy='153' r='8' />
    <circle cx='326' cy='153' r='8' />
    <path d='M180,52 C214,72 244,78 270,78 L270,160 C270,226 232,262 180,290 C128,262 90,226 90,160 L90,78 C116,78 146,72 180,52 Z' />
    <path d='M180,72 C208,88 232,94 252,94 L252,160 C252,214 222,244 180,268 C138,244 108,214 108,160 L108,94 C128,94 152,88 180,72 Z' strokeWidth='4' />
    <rect x='142' y='150' width='76' height='62' rx='8' />
    <path d='M156,150 V132 a24,24 0 0 1 48,0 V150' />
    <circle cx='180' cy='176' r='7' />
    <line x1='180' y1='183' x2='180' y2='198' />
</Frame>

const Cluster = () => <Frame label='CLUSTER'>
    <circle cx='180' cy='168' r='150' strokeDasharray='12 10' strokeWidth='4' />
    {[[110, 102], [250, 102], [110, 236], [250, 236]].map(([x, y], i) => <g key={i}>
        <line x1={x} y1={y} x2={x < 180 ? 70 : 290} y2={y} strokeDasharray='4 8' strokeWidth='4' />
        <circle cx={x < 180 ? 64 : 296} cy={y} r='7' />
    </g>)}
    <line x1='180' y1='130' x2='180' y2='206' />
    <line x1='140' y1='168' x2='220' y2='168' />
    <Cube cx={180} cy={92} s={40} />
    <Cube cx={104} cy={168} s={40} />
    <Cube cx={256} cy={168} s={40} />
    <Cube cx={180} cy={236} s={40} />
</Frame>

// A double open-end wrench, vertical and centred on (180, 160), to be rotated by whoever uses it
const Wrench = () => <g>
    <circle cx='180' cy='62' r='32' fill={BG} />
    <circle cx='180' cy='258' r='32' fill={BG} />
    <rect x='166' y='86' width='28' height='148' rx='10' fill={BG} />
    {/* the open jaws: the background cuts the ring, the stroke draws the jaw's inner edges */}
    <rect x='168' y='22' width='24' height='38' rx='3' fill={BG} />
    <rect x='168' y='260' width='24' height='38' rx='3' fill={BG} />
    <rect x='170' y='16' width='20' height='12' fill={BG} stroke='none' />
    <rect x='170' y='292' width='20' height='12' fill={BG} stroke='none' />
</g>

const Config = () => <Frame label='CONFIG'>
    <Hex cx={86} cy={86} r={52} />
    <Gear cx={86} cy={86} r={20} />
    <Hex cx={274} cy={236} r={50} />
    <Gear cx={274} cy={236} r={19} />
    <Hex cx={326} cy={96} r={16} />
    <Hex cx={34} cy={226} r={16} />
    <Hex cx={186} cy={24} r={14} />
    <line x1='150' y1='24' x2='170' y2='24' strokeDasharray='4 8' strokeWidth='4' />
    <line x1='326' y1='114' x2='326' y2='140' strokeDasharray='4 8' strokeWidth='4' />
    <line x1='34' y1='192' x2='34' y2='208' strokeDasharray='4 8' strokeWidth='4' />
    <g transform='rotate(45 180 160)'><Wrench /></g>
    <text x='20' y='176' fontFamily='Arial, Helvetica, sans-serif' fontWeight='700' fontSize='22' fill='currentColor' stroke='none'>101</text>
    <text x='296' y='162' fontFamily='Arial, Helvetica, sans-serif' fontWeight='700' fontSize='22' fill='currentColor' stroke='none'>101</text>
</Frame>

const Storage = () => <Frame label='STORAGE'>
    {[26, 70, 114].map((y, i) => <g key={i}>
        <rect x='92' y={y} width='176' height='40' rx='8' />
        <circle cx='112' cy={y + 20} r='7' />
        {[0, 1, 2, 3].map(c => [0, 1].map(r => <circle key={`${c}${r}`} cx={210 + c * 14} cy={y + 13 + r * 14} r='2.5' fill='currentColor' stroke='none' />))}
    </g>)}
    <line x1='62' y1='150' x2='42' y2='76' />
    <line x1='298' y1='150' x2='318' y2='76' />
    <rect x='34' y='154' width='292' height='36' rx='18' />
    <path d='M58,190 L94,302 L266,302 L302,190' />
    <line x1='116' y1='190' x2='132' y2='302' strokeWidth='4' />
    <line x1='244' y1='190' x2='228' y2='302' strokeWidth='4' />
    <line x1='70' y1='238' x2='290' y2='238' strokeWidth='4' />
    <line x1='180' y1='284' x2='180' y2='214' />
    <polyline points='162,232 180,212 198,232' />
</Frame>

const Customization = () => <Frame label='CUSTOMIZATION'>
    <g transform='translate(180 160) rotate(-45) scale(0.8) translate(-180 -160)'><Wrench /></g>
    <g transform='rotate(45 180 160)'>
        <rect x='170' y='160' width='20' height='118' rx='10' />
        <rect x='162' y='122' width='36' height='40' rx='4' />
        <path d='M162,122 C158,96 166,64 180,44 C194,64 202,96 198,122' />
        <line x1='180' y1='60' x2='180' y2='120' strokeWidth='3' />
    </g>
    <line x1='262' y1='150' x2='318' y2='150' />
    <circle cx='300' cy='150' r='8' fill={BG} />
    <line x1='262' y1='184' x2='318' y2='184' />
    <circle cx='276' cy='184' r='8' fill={BG} />
    <Gear cx={178} cy={36} r={10} />
    <Gear cx={130} cy={262} r={12} />
    <Hex cx={32} cy={150} />
    <Hex cx={84} cy={160} r={14} />
    <Hex cx={48} cy={232} />
    <Hex cx={180} cy={268} r={14} />
    <Hex cx={292} cy={112} r={12} />
    <circle cx='34' cy='36' r='8' />
    <circle cx='326' cy='36' r='8' />
    <circle cx='34' cy='270' r='8' />
    <circle cx='326' cy='270' r='8' />
    <line x1='44' y1='36' x2='96' y2='36' strokeDasharray='4 8' strokeWidth='4' />
    <line x1='264' y1='36' x2='316' y2='36' strokeDasharray='4 8' strokeWidth='4' />
    <line x1='44' y1='270' x2='96' y2='270' strokeDasharray='4 8' strokeWidth='4' />
</Frame>

/** The drawing of each top-level section, by its id. */
export const SECTION_IMAGES: Record<string, () => JSX.Element> = {
    access: Security,
    cluster: Cluster,
    config: Config,
    custom: Customization,
    network: Network,
    storage: Storage,
    workload: Workload
}
