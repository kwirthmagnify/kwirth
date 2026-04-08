import cronParser from 'cron-parser'

const reorderJsonYamlObject = (objetoJson: any): any => {
    try {
        const priorityOrder = ['apiVersion', 'kind', 'metadata', 'status', 'spec']
        const orderedObject: any = {}
        priorityOrder.forEach(key => {
            if (objetoJson && Object.prototype.hasOwnProperty.call(objetoJson, key)) orderedObject[key] = objetoJson[key]
        })
        Object.keys(objetoJson).forEach(key => {
            if (!priorityOrder.includes(key)) orderedObject[key] = objetoJson[key]
        })
        return orderedObject
    }
    catch (e) {
        console.error("Error al convertir JSON a YAML:", e)
        return {}
    }
}

function objectClone(obj: any) : any {
    if (!obj) return undefined
    return JSON.parse(JSON.stringify(obj))
}

function objectEqual(obj1: any, obj2: any): boolean {
    if (obj1 === obj2) return true

    if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) return false

    const keys1 = Object.keys(obj1)
    const keys2 = Object.keys(obj2)
    if (keys1.length !== keys2.length) return false

    for (const key of keys1) {
        if (!keys2.includes(key) || !objectEqual(obj1[key], obj2[key])) return false
    }
    return true
}

// function objectSearch(obj: any, text: string, matchCase:boolean): string[] {
//     const paths: string[] = []
//     if (!text) return []

//     const searchTerm = matchCase? text : text.toLowerCase()

//     function search(value: any, currentPath: string) {
//         if (value === null || value === undefined) return

//         if (typeof value === 'object') {
//             for (const key in value) {
//                 if (Object.prototype.hasOwnProperty.call(value, key)) {
//                     const newPath = Array.isArray(value) ? 
//                         `${currentPath}[${key}]` : 
//                         (currentPath ? `${currentPath}.${key}` : key)
                    
//                     search(value[key], newPath)
//                 }
//             }
//         }
//         else {
//             if (String(value).toLowerCase().includes(searchTerm)) paths.push(currentPath)
//         }
//     }

//     search(obj, "")

//     return [...new Set(paths)].filter(p => p !== "")
// }

function objectSearch(obj: any, text: string, matchCase: boolean): string[] {
    const paths: string[] = [];
    if (!text) return [];

    const searchTerm = matchCase ? text : text.toLowerCase();

    function search(value: any, currentPath: string) {
        if (value === null || value === undefined) return;

        if (typeof value === 'object') {
            for (const key in value) {
                if (Object.prototype.hasOwnProperty.call(value, key)) {
                    const newPath = Array.isArray(value) ? 
                        `${currentPath}[${key}]` : 
                        (currentPath ? `${currentPath}.${key}` : key);

                    // --- CAMBIO AQUÍ: Validar si la LLAVE coincide ---
                    const keyToCompare = matchCase ? key : key.toLowerCase();
                    if (keyToCompare.includes(searchTerm)) {
                        paths.push(newPath);
                    }

                    search(value[key], newPath);
                }
            }
        } else {
            const valueStr = String(value);
            const valueToCompare = matchCase ? valueStr : valueStr.toLowerCase();
            
            if (valueToCompare.includes(searchTerm)) {
                paths.push(currentPath);
            }
        }
    }

    search(obj, "");

    // Usamos Set para evitar duplicados si una llave y su valor coinciden
    return [...new Set(paths)].filter(p => p !== "");
}

function convertBytesToSize(bytes: number, decimals: number = 2): string {
    if (!Number.isFinite(bytes) || bytes === 0) return '0 Bytes'
    
    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const units = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB']

    const i = Math.floor(Math.log(bytes) / Math.log(k))
    const calculatedValue = parseFloat((bytes / Math.pow(k, i)).toFixed(dm))
    return calculatedValue + ' ' + units[i]
}        

function coresToNumber(size:string) {
        let result = size
        if (size.endsWith('n')) result = (+size.replace('n','') / 1000000000).toString()
        if (size.endsWith('m')) result = (+size.replace('m','') / 1000000).toString()
        if (size.endsWith('k')) result = (+size.replace('k','') / 1000).toString()
        return +result
    }

function convertSizeToBytes(fileSizeString: string): number {
    if (!fileSizeString) return 0
    fileSizeString = fileSizeString.toString()  // somtimes filesizestringn receives a number instead of a string
    const match = fileSizeString.trim().match(/^([\d.]+)\s*([KMGTPE]i?)B?$/i)
    if (!match) {
        if (/^\d+$/.test(fileSizeString)) return +fileSizeString
        console.error(`'size' format is not recognized: ${fileSizeString}`)
        return 0
    }

    const value: number = parseFloat(match[1])
    const unitUpper: string = match[2].toUpperCase().replace(/B$/, '')
    
    let multiplier: number
    const base = 1024

    switch (unitUpper) {
        case 'EI': // Exbibyte
        case 'E':
            multiplier = base ** 6
            break
        case 'PI': // Pebibyte
        case 'P':
            multiplier = base ** 5
            break
        case 'TI': // Tebibyte
        case 'T':
            multiplier = base ** 4
            break
        case 'GI': // Gibibyte
        case 'G':
            multiplier = base ** 3
            break
        case 'MI': // Mebibyte
        case 'M':
            multiplier = base ** 2
            break
        case 'KI': // Kibibyte
        case 'K':
            multiplier = base ** 1
            break
        case '':
        case 'B': // Bytes
            multiplier = 1
            break
        default:
            console.warn(`Unknown unit '${unitUpper}'. We assume Bytes.`)
            multiplier = 1
            break
    }

    // 3. Calcular el resultado final
    return value * multiplier
}

interface INextExecution {
    date: Date
    isoString: string
    timeLeft: {
        days: number
        hours: number
        minutes: number
        seconds: number
    }
    description: string
}

function getNextCronExecution(cronExpression: string): INextExecution|undefined {
    try {
        const interval = cronParser.parse(cronExpression)

        const nextDate = interval.next().toDate()
        const now = new Date()

        const diff = nextDate.getTime() - now.getTime()

        const seconds = Math.floor((diff / 1000) % 60)
        const minutes = Math.floor((diff / (1000 * 60)) % 60)
        const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
        const days = Math.floor(diff / (1000 * 60 * 60 * 24))

        return {
            date: nextDate,
            isoString: nextDate.toISOString(),
            timeLeft: { days, hours, minutes, seconds },
            description: `${days}d ${hours}h ${minutes}m ${seconds}s`
        }
    }
    catch (err: any) {
        return undefined
    }
}

export { type INextExecution }
export { reorderJsonYamlObject, objectEqual, convertBytesToSize, convertSizeToBytes, getNextCronExecution, objectClone, objectSearch, coresToNumber }