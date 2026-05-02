/**
 * Convierte de forma recursiva Maps en Objetos literales.
 * Soporta anidamiento en Arrays, otros Maps y Objetos.
 */
export function mapToJson(data: any): any {
  // 1. Si es un Map, lo convertimos a objeto y procesamos sus valores
  if (data instanceof Map) {
    const obj: Record<string, any> = {};
    for (const [key, value] of data.entries()) {
      // Forzamos la llave a string para que sea un JSON válido
      obj[String(key)] = mapToJson(value);
    }
    return obj;
  }

  // 2. Si es un Array, procesamos cada elemento
  if (Array.isArray(data)) {
    return data.map(mapToJson);
  }

  // 3. Si es un objeto (y no es null), procesamos sus propiedades
  if (data !== null && typeof data === 'object') {
    const newObj: Record<string, any> = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        newObj[key] = mapToJson(data[key]);
      }
    }
    return newObj;
  }

  // 4. Si es un valor primitivo, lo devolvemos tal cual
  return data;
}
