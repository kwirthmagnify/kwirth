/*
    A secret multi-line field has no type='password' to lean on, so it is masked by hand: one dot per character,
    line breaks kept. The mask has the SAME length as the real value and every dot stands at the position of the
    character it hides, which is what lets the field stay editable while hidden.

    The mask alone cannot tell which dot an edit touched — deleting the 3rd or the 4th character of '••••' leaves
    the same '•••' — so the edit is located with the CARET after it (the textarea's selectionEnd): everything after
    the caret is the untouched tail, and the head is what the masks share before the edit. That span of the real
    value is replaced by what was typed or pasted. Typing, pasting over a selection, Backspace and Delete all
    reduce to that. The one case it cannot tell apart is a selection replaced by the mask's own glyph '•'.
*/

export const MASK_CHAR = '•'

export const maskText = (value: string): string => value.replace(/[^\n]/g, MASK_CHAR)

export const applyMaskedEdit = (real: string, maskedBefore: string, maskedAfter: string, caret: number): string => {
    const tail = Math.min(maskedAfter.length - caret, maskedBefore.length)
    const limit = Math.min(caret, maskedBefore.length - tail)
    let head = 0
    while (head < limit && maskedBefore[head] === maskedAfter[head]) head++
    return real.slice(0, head) + maskedAfter.slice(head, caret) + real.slice(maskedBefore.length - tail)
}
