import React, { useState } from 'react'
import { Box, Checkbox, FormControlLabel, IconButton, Stack, Typography } from '@mui/material'
import { ExpandMore, ChevronRight } from '@mui/icons-material'
import { EExtensionType, CORE_SETTINGS_KEY, CORE_SHARED_AI_KEY } from '@kwirthmagnify/kwirth-common'

/*
    Shared logic between the Export and Import dialogs: the item shape, the block grouping, the core's
    own items, and the selection list renderer. Extracted so each dialog carries only what is its own.
*/

// An item of the list. The key carries the type up front so a plugin and a provider with the same id do
// not collide in the same Set.
export interface ISelectableItem {
    key: string
    label: string
    detail: string
    /** The block it is grouped into. The core's own goes together; extensions, by type. */
    group: string
}

export const GROUP_GENERAL = 'Kwirth'

// Block name per extension type. In the plural, which is how they are named in the rest of the UI.
export const groupOf = (type: EExtensionType): string => {
    switch (type) {
        case EExtensionType.PLUGIN: return 'Plugins'
        case EExtensionType.PROVIDER: return 'Providers'
        case EExtensionType.SENDER: return 'Senders'
        case EExtensionType.WEBHOOK: return 'Webhooks'
        case EExtensionType.IDP: return 'Identity providers'
        case EExtensionType.AITOOLSET: return 'AI toolsets'
        case EExtensionType.DCE: return 'DCEs'
        case EExtensionType.THEME: return 'Themes'
        case EExtensionType.HOMEPAGE: return 'Homepages'
        case EExtensionType.LOGIN: return 'Logins'
        case EExtensionType.DOCS: return 'Documentation'
        case EExtensionType.PACK: return 'Packs'
        default: return 'Extensions'
    }
}

export const coreItems: ISelectableItem[] = [
    { key: CORE_SETTINGS_KEY, group: GROUP_GENERAL, label: 'Kwirth settings', detail: 'metrics interval, log levels, marketplaces and package registries' },
    { key: CORE_SHARED_AI_KEY, group: GROUP_GENERAL, label: 'AI providers and models', detail: 'the common store, which belongs to no extension' }
]

/*
    The tickable list, by BLOCKS: Kwirth's own in one, and the extensions grouped by type. Flat it was
    unreadable past a dozen — a sender, an IdP and a plugin are not chosen by the same criterion, and
    seeing them jumbled forces reading the whole list.

    Each block carries its own tick box, which ticks and unticks only its own. 'disabled' leaves items
    VISIBLE but not tickable: an extension that cannot export is shown with its reason, because a short
    list with no explanation is worse than a declared gap.
*/
export const SelectionList = (props: {
    items: ISelectableItem[]
    selected: Set<string>
    onToggle: (key: string, on: boolean) => void
    disabled?: (item: ISelectableItem) => boolean
}) => {
    const { items, selected, onToggle, disabled } = props
    // Blocks start collapsed; the user expands the ones they care about. Tracking EXPANDED (not
    // collapsed) means a group that appears after the items change (e.g. a new file in import) also
    // starts collapsed, without having to reset the state.
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const toggleExpand = (group: string) => setExpanded(prev => {
        const next = new Set(prev)
        if (next.has(group)) next.delete(group)
        else next.add(group)
        return next
    })
    const blocks: { name: string, items: ISelectableItem[] }[] = []
    for (const item of items) {
        const block = blocks.find(b => b.name === item.group)
        if (block) block.items.push(item)
        else blocks.push({ name: item.group, items: [item] })
    }
    return <Stack spacing={1}>
        { blocks.map(block => {
            const tickable = block.items.filter(i => !(disabled?.(i) ?? false))
            const allOn = tickable.length > 0 && tickable.every(i => selected.has(i.key))
            const isExpanded = expanded.has(block.name)
            return <Box key={block.name} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1 }}>
                <Stack direction='row' alignItems='center'>
                    <IconButton size='small' onClick={() => toggleExpand(block.name)}>
                        {isExpanded ? <ExpandMore /> : <ChevronRight />}
                    </IconButton>
                    <FormControlLabel
                        control={<Checkbox size='small' checked={allOn} disabled={tickable.length === 0}
                            indeterminate={!allOn && tickable.some(i => selected.has(i.key))}
                            onChange={e => tickable.forEach(i => onToggle(i.key, e.target.checked))} />}
                        label={<Typography variant='body2'><b>{block.name}</b></Typography>} />
                </Stack>
                { isExpanded && block.items.map(item => {
                    const off = disabled?.(item) ?? false
                    return <Stack key={item.key} direction='row' alignItems='center' sx={{ pl: 3 }}>
                        <Checkbox size='small' checked={selected.has(item.key)} disabled={off}
                            onChange={e => onToggle(item.key, e.target.checked)} />
                        <Box>
                            <Typography variant='body2' color={off ? 'text.disabled' : 'text.primary'}>{item.label}</Typography>
                            <Typography variant='caption' color='text.secondary'>{item.detail}</Typography>
                        </Box>
                    </Stack>
                })}
            </Box>
        })}
    </Stack>
}
