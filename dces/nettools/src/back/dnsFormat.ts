import { MxRecord, SoaRecord, SrvRecord } from 'node:dns'

/*
    Turning what `node:dns` answers into the one shape the contract promises: text, whatever the record
    type was (PRD D5).

    There is a formatter per type instead of one function with a switch and a cast, because at each
    call site the type is known at compile time: this way nothing is cast, and each formatter is a pure
    one-liner the harness pins with a fixture.

    The text is not decoration: it is the canonical presentation of each record — the same order of
    fields a zone file uses — so that a consumer that wants the pieces back can split it.
*/

/**
 * `10 mail.example.com` — priority first, as in a zone file.
 *
 * A domain that takes no mail publishes a NULL MX (RFC 7505), which Node answers with an empty
 * exchange. Written out as-is that is `"0 "`, a trailing space a consumer would have to trim; the zone
 * file writes it `0 .`, and that is what goes out.
 */
export const formatMx = (records: MxRecord[]): string[] =>
    records.map(record => `${record.priority} ${record.exchange || '.'}`)

/** `0 5 5060 sip.example.com` — priority, weight, port, target. */
export const formatSrv = (records: SrvRecord[]): string[] =>
    records.map(record => `${record.priority} ${record.weight} ${record.port} ${record.name}`)

/**
 * A TXT record arrives split into chunks of at most 255 bytes, which is a transport detail and not
 * something a consumer should have to know: they are joined back with nothing in between.
 */
export const formatTxt = (records: string[][]): string[] =>
    records.map(chunks => chunks.join(''))

/** The SOA's seven fields in their canonical order, as a single record. */
export const formatSoa = (record: SoaRecord): string[] =>
    [`${record.nsname} ${record.hostmaster} ${record.serial} ${record.refresh} ${record.retry} ${record.expire} ${record.minttl}`]
