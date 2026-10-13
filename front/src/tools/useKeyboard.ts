import { MutableRefObject, RefObject, useEffect, useRef } from 'react'

type CloseWithId = (id: string) => void
type CloseNoId = () => void

/*
    Escape closes a core dialog: `const escapeRef = useEscapeToClose(cancel)` and `<Dialog ref={escapeRef}>`.

    It listens on window, so it works wherever the focus is — a dialog opened from the menu does not get
    the focus (the drawer gives it back to its button on closing), and MUI's own onClose only hears Escape
    from inside. What it must NOT do, and the first version did:

      · close the dialog when the Escape is for an open dropdown or menu: MUI closes those itself, and the
        dialog stays with whatever was being edited
      · close a dialog that is not the one on top: with two stacked, only the upper one may react, and if
        the upper one has no Escape (a 'Configure:'), nothing underneath closes either
      · stop every keydown: that kept the keys from reaching the dialog's own components (Enter, arrows)

    Every dialog using it registers its root; on Escape only the entry whose root is the topmost dialog acts.
*/
interface IEscapeEntry {
    root: RefObject<HTMLDivElement>
    close: MutableRefObject<() => void>
}

const escapeEntries: IEscapeEntry[] = []

// An open select, autocomplete or menu: MUI closes it on Escape, and that Escape is not for the dialog.
const POPUP_SELECTOR = '[role="listbox"], .MuiPopover-root, .MuiMenu-root'

// The dialog on top is the last one portalled to <body>: MUI appends each one as it opens.
const topmostDialog = (): Element | undefined =>
    Array.from(document.body.children).filter(element => element.classList.contains('MuiDialog-root')).at(-1)

const onEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    if (document.querySelector(POPUP_SELECTOR)) return
    const top = topmostDialog()
    const entry = escapeEntries.find(e => e.root.current !== null && e.root.current === top)
    if (!entry) return
    event.stopPropagation()
    entry.close.current()
}

export const useEscapeToClose = (close: () => void): RefObject<HTMLDivElement> => {
    const root = useRef<HTMLDivElement>(null)
    const closeRef = useRef(close)
    closeRef.current = close

    useEffect(() => {
        const entry: IEscapeEntry = { root, close: closeRef }
        if (escapeEntries.length === 0) window.addEventListener('keydown', onEscape, true)
        escapeEntries.push(entry)
        return () => {
            escapeEntries.splice(escapeEntries.indexOf(entry), 1)
            if (escapeEntries.length === 0) window.removeEventListener('keydown', onEscape, true)
        }
    }, [])

    return root
}

/*
    ⚠️ Only for Magnify's floating windows (ResizableDialog), pending their move into the Magnify plugin.
    It listens on window in the CAPTURE phase and stops every keydown, so Escape on an open select closes
    the whole window and no key reaches the window's components. Core dialogs use useEscapeToClose.
*/
export const useKeyboard = (onEscape?: CloseWithId | CloseNoId, id?: string) => {
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            event.stopPropagation()
            if (event.key === 'Escape' && onEscape) {
                if (id)
                    (onEscape as CloseWithId)(id)
                else
                    (onEscape as CloseNoId)()
            }
        }
        window.addEventListener('keydown', handleKeyDown, true)
        return () => window.removeEventListener('keydown', handleKeyDown, true)
    }, [onEscape, id])
}
