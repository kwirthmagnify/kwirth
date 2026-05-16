import { useEffect } from 'react'

type CloseWithId = (id: string) => void
type CloseNoId = () => void

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
