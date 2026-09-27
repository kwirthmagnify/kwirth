import { SvgIcon, SvgIconProps } from '@mui/material'

/*
    The icons ONLY the Metrics channel uses (the chart types menu).

    Kwirth's barrel (`common-front/src/kwirthicons.ts`) is the list of COMMON icons, and it is also the
    one the core publishes to the extensions at `window.__kwirth__.MUI.icons`. An icon used by a single
    menu has no business in that API.

    ⚠️ Careful with the names: `AreaChart` and `PieChart` are ALSO **recharts** components, and there they
    are indeed used in several places (`Chart.tsx`, `Homepage.tsx`). They are different things with the
    same name: here they are the menu's ICONS. If one day a file needs both the icon and the chart, one of
    the two has to be renamed in the import.

    To add another one: copy the `d` from `@mui/icons-material/<Name>.js` — all its paths if it has several.

    The paths are Material Icons (Apache-2.0).
*/

export const AreaChart = (props: SvgIconProps) => (
    <SvgIcon {...props}><path d="M3 13v7h18v-1.5l-9-7L8 17zm0-6 4 3 5-7 5 4h4v8.97l-9.4-7.31-3.98 5.48L3 10.44z" /></SvgIcon>
)

export const PieChart = (props: SvgIconProps) => (
    <SvgIcon {...props}><path d="M11 2v20c-5.07-.5-9-4.79-9-10s3.93-9.5 9-10m2.03 0v8.99H22c-.47-4.74-4.24-8.52-8.97-8.99m0 11.01V22c4.74-.47 8.5-4.25 8.97-8.99z" /></SvgIcon>
)

export const LegendToggle = (props: SvgIconProps) => (
    <SvgIcon {...props}><path d="M20 15H4v-2h16zm0 2H4v2h16zm-5-6 5-3.55V5l-5 3.55L10 5 4 8.66V11l5.92-3.61z" /></SvgIcon>
)

export const ThirtyFps = (props: SvgIconProps) => (
    <SvgIcon {...props}><path d="M2 5v3h6v2.5H3v3h5V16H2v3h6c1.66 0 3-1.34 3-3v-1.9c0-1.16-.94-2.1-2.1-2.1 1.16 0 2.1-.94 2.1-2.1V8c0-1.66-1.34-3-3-3zm17 3v8h-4V8zm0-3h-4c-1.66 0-3 1.34-3 3v8c0 1.66 1.34 3 3 3h4c1.66 0 3-1.34 3-3V8c0-1.66-1.34-3-3-3" /></SvgIcon>
)
