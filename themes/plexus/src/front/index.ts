declare const window: any

// ── Plexus Tech brand palette ─────────────────────────────────────────────
// Navy  : #1C3A5C  (dark chevron, borders, appbar)
// Coral : #F06272  (accent, numbers, card borders, CTA)
// Teal  : #20B4C8  (secondary, icons)
// Light : #F8F9FC  (slide backgrounds)
// ──────────────────────────────────────────────────────────────────────────

const MuiButton = {
    styleOverrides: {
        root: {
            borderRadius: 4,
            textTransform: 'none' as const,
            fontWeight: 700,
            letterSpacing: 0.4
        },
        containedPrimary: ({ theme }: any) => ({
            background: theme.palette.mode === 'dark' ? '#F06272' : '#1C3A5C',
            color: '#FFFFFF',
            boxShadow: theme.palette.mode === 'dark'
                ? '0 2px 8px rgba(240,98,114,0.35)'
                : '0 2px 8px rgba(28,58,92,0.30)',
            '&:hover': {
                background: theme.palette.mode === 'dark' ? '#D94E5E' : '#14294A',
                boxShadow: theme.palette.mode === 'dark'
                    ? '0 4px 14px rgba(240,98,114,0.45)'
                    : '0 4px 14px rgba(28,58,92,0.40)'
            }
        }),
        outlinedPrimary: ({ theme }: any) => ({
            borderColor: theme.palette.mode === 'dark' ? '#F06272' : '#1C3A5C',
            color: theme.palette.mode === 'dark' ? '#F06272' : '#1C3A5C',
            '&:hover': {
                background: theme.palette.mode === 'dark'
                    ? 'rgba(240,98,114,0.08)'
                    : 'rgba(28,58,92,0.06)'
            }
        })
    }
}

const MuiAppBar = {
    styleOverrides: {
        root: ({ theme }: any) => ({
            background: theme.palette.mode === 'dark' ? '#0D1B2A' : '#1C3A5C',
            borderBottom: `3px solid #F06272`,
            boxShadow: 'none',
            color: '#FFFFFF'
        })
    }
}

const MuiPaper = {
    styleOverrides: {
        root: ({ theme }: any) => ({
            backgroundImage: 'none',
            border: `1px solid ${theme.palette.mode === 'dark' ? '#1A3050' : '#E0E6EF'}`
        })
    }
}

const MuiCard = {
    styleOverrides: {
        root: ({ theme }: any) => ({
            background: theme.palette.mode === 'dark' ? '#112237' : '#FFFFFF',
            border: `1px solid ${theme.palette.mode === 'dark' ? '#1A3050' : '#E0E6EF'}`,
            borderRadius: 8,
            borderLeft: `4px solid #F06272`
        })
    }
}

const MuiCardHeader = {
    styleOverrides: {
        root: ({ theme }: any) => ({
            background: theme.palette.mode === 'dark'
                ? 'linear-gradient(135deg, #0D1B2A 0%, #112237 100%)'
                : 'linear-gradient(135deg, #F0F4FA 0%, #E8EFF8 100%)',
            borderBottom: `1px solid ${theme.palette.mode === 'dark' ? '#1A3050' : '#D8E2EE'}`,
            padding: '10px 16px'
        }),
        title: ({ theme }: any) => ({
            color: theme.palette.mode === 'dark' ? '#F06272' : '#1C3A5C',
            fontWeight: 700,
            fontSize: '0.875rem'
        })
    }
}

const MuiDialog = {
    styleOverrides: {
        paper: ({ theme }: any) => ({
            background: theme.palette.mode === 'dark' ? '#0D1B2A' : '#FFFFFF',
            border: `1px solid ${theme.palette.mode === 'dark' ? '#1A3050' : '#D8E2EE'}`,
            borderTop: `3px solid #F06272`,
            borderRadius: 8,
            backgroundImage: 'none'
        })
    }
}

const MuiDialogTitle = {
    styleOverrides: {
        root: ({ theme }: any) => ({
            background: theme.palette.mode === 'dark'
                ? 'linear-gradient(135deg, #0A1422 0%, #0D1B2A 100%)'
                : 'linear-gradient(135deg, #F0F4FA 0%, #E8EFF8 100%)',
            borderBottom: `1px solid ${theme.palette.mode === 'dark' ? '#1A3050' : '#D8E2EE'}`,
            color: theme.palette.mode === 'dark' ? '#F8F9FC' : '#1C3A5C',
            fontWeight: 700,
            fontSize: '0.95rem',
            padding: '12px 20px'
        })
    }
}

const MuiDialogContent = {
    styleOverrides: {
        root: { padding: '16px 20px' }
    }
}

const MuiDialogActions = {
    styleOverrides: {
        root: ({ theme }: any) => ({
            borderTop: `1px solid ${theme.palette.mode === 'dark' ? '#1A3050' : '#D8E2EE'}`,
            padding: '10px 16px'
        })
    }
}

const MuiChip = {
    styleOverrides: {
        root: { borderRadius: 4, fontWeight: 700, fontSize: '0.72rem' },
        colorPrimary: ({ theme }: any) => ({
            background: theme.palette.mode === 'dark' ? '#1A3050' : '#E8EFF8',
            color: theme.palette.mode === 'dark' ? '#F06272' : '#1C3A5C',
            borderColor: theme.palette.mode === 'dark' ? '#F06272' : '#1C3A5C'
        })
    }
}

const MuiDivider = {
    styleOverrides: {
        root: ({ theme }: any) => ({
            borderColor: theme.palette.mode === 'dark' ? '#1A3050' : '#D8E2EE'
        })
    }
}

const MuiTableHead = {
    styleOverrides: {
        root: ({ theme }: any) => ({
            background: theme.palette.mode === 'dark' ? '#0D1B2A' : '#1C3A5C',
            '& .MuiTableCell-head': {
                color: '#FFFFFF',
                fontWeight: 700
            }
        })
    }
}

const MuiCssBaseline = {
    styleOverrides: (theme: any) => ({
        body: {
            background: theme.palette.mode === 'dark'
                ? 'linear-gradient(160deg, #080F1A 0%, #0D1B2A 100%)'
                : '#F8F9FC',
            scrollbarColor: theme.palette.mode === 'dark' ? '#1A3050 transparent' : '#C8D4E4 transparent',
            scrollbarWidth: 'thin'
        }
    })
}

window.__kwirth_themes__['plexus'] = {
    displayName: 'Plexus',
    getThemeOptions: (mode: 'light' | 'dark') => ({
        cssVariables: true,
        palette: {
            mode,
            primary: {
                main:         mode === 'dark' ? '#F06272' : '#1C3A5C',
                light:        mode === 'dark' ? '#F5909D' : '#2E5480',
                dark:         mode === 'dark' ? '#D94E5E' : '#102A44',
                contrastText: '#FFFFFF'
            },
            secondary: {
                main:         '#20B4C8',
                light:        '#4DC8D8',
                dark:         '#1490A0',
                contrastText: '#FFFFFF'
            },
            error:   { main: '#F06272' },
            warning: { main: '#F5B731' },
            info:    { main: '#20B4C8' },
            success: { main: '#4CAF82' },
            background: {
                default: mode === 'dark' ? '#080F1A' : '#F8F9FC',
                paper:   mode === 'dark' ? '#112237' : '#FFFFFF'
            },
            text: {
                primary:   mode === 'dark' ? '#E8EDF5' : '#1C3A5C',
                secondary: mode === 'dark' ? '#7A9BBF' : '#4A6080',
                disabled:  mode === 'dark' ? '#3A5068' : '#A0B4C8'
            },
            divider: mode === 'dark' ? '#1A3050' : '#D8E2EE'
        },
        typography: {
            fontFamily: '"Lato", "Nunito", "Segoe UI", "Roboto", sans-serif',
            fontSize: 13,
            h1: { fontWeight: 800, letterSpacing: -0.5 },
            h2: { fontWeight: 700, letterSpacing: -0.3 },
            h3: { fontWeight: 700 },
            h4: { fontWeight: 700 },
            h5: { fontWeight: 700 },
            h6: { fontWeight: 700 },
            button: { fontWeight: 700, letterSpacing: 0.4 },
            overline: { fontWeight: 700, letterSpacing: 1.5 }
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
            MuiCssBaseline
        }
    })
}
