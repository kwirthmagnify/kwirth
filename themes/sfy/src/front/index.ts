declare const window: any

// ── SFY brand palette ─────────────────────────────────────────────────────
// SkyBlue : #1BBCEE  (primary, CTAs, highlights — the dominant brand color)
// NavyDark: #186D8E  (primary dark, hover states)
// Teal    : #35BB8B  (secondary, success accents)
// Amber   : #F7B441  (warning, special highlights)
// Charcoal: #252932  (dark backgrounds, dark-mode surface)
// Light   : #F8F8F8  (light page background)
// ──────────────────────────────────────────────────────────────────────────

const MuiButton = {
    styleOverrides: {
        root: {
            borderRadius: 6,
            textTransform: 'none' as const,
            fontWeight: 700,
            letterSpacing: 0.3,
        },
        containedPrimary: ({ theme }: any) => ({
            background: '#1BBCEE',
            color: '#FFFFFF',
            boxShadow: '0 2px 8px rgba(27,188,238,0.30)',
            '&:hover': {
                background: '#186D8E',
                boxShadow: '0 4px 14px rgba(27,188,238,0.40)',
            },
        }),
        outlinedPrimary: ({ theme }: any) => ({
            borderColor: '#1BBCEE',
            color: theme.palette.mode === 'dark' ? '#1BBCEE' : '#186D8E',
            '&:hover': {
                background: 'rgba(27,188,238,0.08)',
                borderColor: '#186D8E',
            },
        }),
        containedSecondary: {
            background: '#35BB8B',
            color: '#FFFFFF',
            boxShadow: '0 2px 8px rgba(53,187,139,0.30)',
            '&:hover': {
                background: '#279B70',
                boxShadow: '0 4px 14px rgba(53,187,139,0.40)',
            },
        },
    },
}

const MuiAppBar = {
    styleOverrides: {
        root: ({ theme }: any) => ({
            background: theme.palette.mode === 'dark' ? '#1B1F26' : '#252932',
            borderBottom: '3px solid #1BBCEE',
            boxShadow: 'none',
            color: '#FFFFFF',
        }),
    },
}

const MuiPaper = {
    styleOverrides: {
        root: ({ theme }: any) => ({
            backgroundImage: 'none',
            border: `1px solid ${theme.palette.mode === 'dark' ? '#2E3440' : '#E0E8EF'}`,
        }),
    },
}

const MuiCard = {
    styleOverrides: {
        root: ({ theme }: any) => ({
            background: theme.palette.mode === 'dark' ? '#1E2530' : '#FFFFFF',
            border: `1px solid ${theme.palette.mode === 'dark' ? '#2E3440' : '#E0E8EF'}`,
            borderRadius: 8,
            borderLeft: '4px solid #1BBCEE',
        }),
    },
}

const MuiCardHeader = {
    styleOverrides: {
        root: ({ theme }: any) => ({
            background: theme.palette.mode === 'dark'
                ? 'linear-gradient(135deg, #1B1F26 0%, #1E2530 100%)'
                : 'linear-gradient(135deg, #EEF8FD 0%, #E2F4FB 100%)',
            borderBottom: `1px solid ${theme.palette.mode === 'dark' ? '#2E3440' : '#C8E8F5'}`,
            padding: '10px 16px',
        }),
        title: ({ theme }: any) => ({
            color: theme.palette.mode === 'dark' ? '#1BBCEE' : '#186D8E',
            fontWeight: 700,
            fontSize: '0.875rem',
        }),
    },
}

const MuiDialog = {
    styleOverrides: {
        paper: ({ theme }: any) => ({
            background: theme.palette.mode === 'dark' ? '#1B1F26' : '#FFFFFF',
            border: `1px solid ${theme.palette.mode === 'dark' ? '#2E3440' : '#C8E8F5'}`,
            borderTop: '3px solid #1BBCEE',
            borderRadius: 8,
            backgroundImage: 'none',
        }),
    },
}

const MuiDialogTitle = {
    styleOverrides: {
        root: ({ theme }: any) => ({
            background: theme.palette.mode === 'dark'
                ? 'linear-gradient(135deg, #181C22 0%, #1B1F26 100%)'
                : 'linear-gradient(135deg, #EEF8FD 0%, #E2F4FB 100%)',
            borderBottom: `1px solid ${theme.palette.mode === 'dark' ? '#2E3440' : '#C8E8F5'}`,
            color: theme.palette.mode === 'dark' ? '#F0F8FF' : '#186D8E',
            fontWeight: 700,
            fontSize: '0.95rem',
            padding: '12px 20px',
        }),
    },
}

const MuiDialogContent = {
    styleOverrides: {
        root: { padding: '16px 20px' },
    },
}

const MuiDialogActions = {
    styleOverrides: {
        root: ({ theme }: any) => ({
            borderTop: `1px solid ${theme.palette.mode === 'dark' ? '#2E3440' : '#C8E8F5'}`,
            padding: '10px 16px',
        }),
    },
}

const MuiChip = {
    styleOverrides: {
        root: { borderRadius: 4, fontWeight: 700, fontSize: '0.72rem' },
        colorPrimary: ({ theme }: any) => ({
            background: theme.palette.mode === 'dark' ? '#1A2A35' : '#E2F4FB',
            color: theme.palette.mode === 'dark' ? '#1BBCEE' : '#186D8E',
            borderColor: theme.palette.mode === 'dark' ? '#1BBCEE' : '#1BBCEE',
        }),
    },
}

const MuiDivider = {
    styleOverrides: {
        root: ({ theme }: any) => ({
            borderColor: theme.palette.mode === 'dark' ? '#2E3440' : '#C8E8F5',
        }),
    },
}

const MuiTableHead = {
    styleOverrides: {
        root: ({ theme }: any) => ({
            background: theme.palette.mode === 'dark' ? '#1B1F26' : '#252932',
            '& .MuiTableCell-head': {
                color: '#FFFFFF',
                fontWeight: 700,
            },
        }),
    },
}

const MuiLinearProgress = {
    styleOverrides: {
        root: {
            borderRadius: 4,
            height: 6,
        },
        bar: {
            background: 'linear-gradient(90deg, #1BBCEE 0%, #35BB8B 100%)',
            borderRadius: 4,
        },
    },
}

const MuiCssBaseline = {
    styleOverrides: (theme: any) => ({
        body: {
            background: theme.palette.mode === 'dark'
                ? 'linear-gradient(160deg, #141820 0%, #1B1F26 100%)'
                : '#F8F8F8',
            scrollbarColor: theme.palette.mode === 'dark'
                ? '#2E3440 transparent'
                : '#B8D8EC transparent',
            scrollbarWidth: 'thin',
        },
    }),
}

window.__kwirth_themes__['sfy'] = {
    displayName: 'SFY',
    getThemeOptions: (mode: 'light' | 'dark') => ({
        cssVariables: true,
        palette: {
            mode,
            primary: {
                main:         '#1BBCEE',
                light:        '#4DCEF5',
                dark:         '#186D8E',
                contrastText: '#FFFFFF',
            },
            secondary: {
                main:         '#35BB8B',
                light:        '#5DCCA3',
                dark:         '#279B70',
                contrastText: '#FFFFFF',
            },
            error:   { main: '#E05570' },
            warning: { main: '#F7B441' },
            info:    { main: '#289DCC' },
            success: { main: '#35BB8B' },
            background: {
                default: mode === 'dark' ? '#141820' : '#F8F8F8',
                paper:   mode === 'dark' ? '#1E2530' : '#FFFFFF',
            },
            text: {
                primary:   mode === 'dark' ? '#EEF4F8' : '#252932',
                secondary: mode === 'dark' ? '#7A90A4' : '#65615F',
                disabled:  mode === 'dark' ? '#3A4555' : '#AAAAAA',
            },
            divider: mode === 'dark' ? '#2E3440' : '#C8E8F5',
        },
        typography: {
            fontFamily: '"Lato", "Montserrat", "Segoe UI", "Roboto", sans-serif',
            fontSize: 13,
            h1: { fontFamily: '"Montserrat", "Lato", sans-serif', fontWeight: 800, letterSpacing: -0.5 },
            h2: { fontFamily: '"Montserrat", "Lato", sans-serif', fontWeight: 700, letterSpacing: -0.3 },
            h3: { fontFamily: '"Montserrat", "Lato", sans-serif', fontWeight: 700 },
            h4: { fontFamily: '"Montserrat", "Lato", sans-serif', fontWeight: 700 },
            h5: { fontFamily: '"Montserrat", "Lato", sans-serif', fontWeight: 700 },
            h6: { fontFamily: '"Montserrat", "Lato", sans-serif', fontWeight: 700 },
            button: { fontWeight: 700, letterSpacing: 0.3 },
            overline: { fontWeight: 700, letterSpacing: 1.5 },
        },
        shape: { borderRadius: 6 },
        components: {
            MuiButton,
            MuiAppBar,
            MuiPaper,
            MuiCard,
            MuiCardHeader,
            MuiDialog,
            MuiDialogTitle,
            MuiDialogContent,
            MuiDialogActions,
            MuiChip,
            MuiDivider,
            MuiTableHead,
            MuiLinearProgress,
            MuiCssBaseline,
        },
    }),
}
