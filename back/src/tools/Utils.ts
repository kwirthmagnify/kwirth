/**
 * Recursively converts Maps into plain Objects.
 * It supports nesting in Arrays, other Maps and Objects.
 */
export function mapToJson(data: any): any {
  // 1. If it is a Map, we convert it into an object and process its values
  if (data instanceof Map) {
    const obj: Record<string, any> = {};
    for (const [key, value] of data.entries()) {
      // We force the key to a string so that it is valid JSON
      obj[String(key)] = mapToJson(value);
    }
    return obj;
  }

  // 2. If it is an Array, we process every element
  if (Array.isArray(data)) {
    return data.map(mapToJson);
  }

  // 3. If it is an object (and not null), we process its properties
  if (data !== null && typeof data === 'object') {
    const newObj: Record<string, any> = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        newObj[key] = mapToJson(data[key]);
      }
    }
    return newObj;
  }

  // 4. If it is a primitive value, we return it as it is
  return data;
}
