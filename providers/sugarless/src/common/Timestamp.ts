/*
    Parseo de las marcas de tiempo de LibreLinkUp.

    La API entrega DOS por lectura y no son la misma cosa:
      FactoryTimestamp : UTC        <- esta es la que se usa
      Timestamp        : hora LOCAL del paciente, SIN offset

    Se usa FactoryTimestamp porque una hora local sin offset es ambigua por definicion: en el cambio
    de hora de otoño la misma cadena designa dos instantes distintos, y en el de primavera designa uno
    que no existe. El sintoma no seria una excepcion, seria una curva con un salto de una hora, que es
    justo el tipo de fallo que nadie mira hasta que ya lleva meses ahi.

    El formato es 'M/D/YYYY h:mm:ss AM|PM' (mes primero, 12 horas), no ISO-8601. Se parsea a mano con
    una expresion regular y Date.UTC, NUNCA con Date.parse(): el comportamiento de Date.parse sobre
    formatos no-ISO es dependiente de la implementacion, asi que un mismo build podria interpretar la
    misma cadena de dos maneras segun donde corra.
*/

const TWELVE_HOUR = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i

// Variante sin AM/PM: se interpreta como 24 horas. No se ha observado, pero la API es localizable y
// aceptarla cuesta una rama; rechazar una lectura buena cuesta un hueco en la grafica.
const TWENTY_FOUR_HOUR = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/

const inRange = (value: number, min: number, max: number): boolean => value >= min && value <= max

/*
    Convierte la hora de 12 a 24. Los dos casos que se equivocan siempre si se hace a ojo son las 12:
    12 AM son las 00 y 12 PM son las 12, no al reves y no 24.
*/
const to24Hour = (hour12: number, meridiem: string): number => {
    const pm = meridiem.toUpperCase() === 'PM'
    if (hour12 === 12) return pm ? 12 : 0
    return pm ? hour12 + 12 : hour12
}

/**
 * Devuelve el epoch en milisegundos, o undefined si la cadena no encaja o las cifras no forman una
 * fecha real. Se devuelve undefined en vez de lanzar porque una lectura ilegible no debe tumbar el
 * ciclo de polling: se descarta y se reporta.
 */
export const parseLibreTimestamp = (raw: string | undefined | null): number | undefined => {
    if (typeof raw !== 'string') return undefined
    const text = raw.trim()
    if (text === '') return undefined

    const twelve = TWELVE_HOUR.exec(text)
    const twentyFour = twelve ? undefined : TWENTY_FOUR_HOUR.exec(text)
    const match = twelve ?? twentyFour
    if (!match) return undefined

    const month = Number(match[1])
    const day = Number(match[2])
    const year = Number(match[3])
    const rawHour = Number(match[4])
    const minute = Number(match[5])
    const second = Number(match[6])

    if (!inRange(month, 1, 12)) return undefined
    if (!inRange(day, 1, 31)) return undefined
    if (!inRange(minute, 0, 59)) return undefined
    if (!inRange(second, 0, 59)) return undefined

    let hour: number
    if (twelve) {
        if (!inRange(rawHour, 1, 12)) return undefined
        hour = to24Hour(rawHour, match[7])
    }
    else {
        if (!inRange(rawHour, 0, 23)) return undefined
        hour = rawHour
    }

    const epoch = Date.UTC(year, month - 1, day, hour, minute, second)

    /*
        Date.UTC normaliza en silencio lo imposible: el 31 de febrero se convierte en el 2 o 3 de
        marzo sin protestar. Se comprueba que los componentes sobreviven el viaje de ida y vuelta,
        para que una fecha inventada se rechace en vez de colarse desplazada.
    */
    const check = new Date(epoch)
    if (check.getUTCFullYear() !== year) return undefined
    if (check.getUTCMonth() !== month - 1) return undefined
    if (check.getUTCDate() !== day) return undefined

    return epoch
}
