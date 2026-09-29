/*
    What counts as something worth trying to reach or resolve.

    It is a pure guard, and its job is the MESSAGE. Kwirth runs in a container and these tools spawn
    nothing, so there is no binary to trick and no shell to inject into; what there is, is a caller that
    typed `my host.local` or pasted a whole URL, and a resolver error such as `queryA EBADNAME` that
    does not say which of the two it was. Answering `Invalid name 'my host.local'` does.

    Letters, digits, `.`, `-`, `_` and `:` — the colon is what IPv6 needs, and a leading one (`::1`) is
    legal, so the shape is checked and not the position of every character.
*/
export const isValidTarget = (target: string): boolean =>
    target.length > 0 && target.length <= 255 && /^[A-Za-z0-9._:-]+$/.test(target)
