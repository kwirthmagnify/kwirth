import fs from 'fs'
import path from 'path'

/** What resolveDevTgz found: the tarball to install, and anything the caller should say out loud. */
export interface IDevTgzResolution {
    tgz?: string
    warning?: string
}

/*  An entry in kwirth-dev.json may name the tgz or the FOLDER that holds it.
 *
 *  It used to have to name the file, and the file had no version in its name ('excubitor.tgz'). Now that
 *  every artifact's tarball carries scope and version, naming the file would mean editing kwirth-dev.json
 *  on every bump — and forgetting it does NOT fail: the dev silently loads an older guide or login, which
 *  is the worst way for this to go wrong. Pointing at the folder removes the problem instead of working
 *  around it.
 *
 *  Each build deletes its previous tarballs, so there is normally exactly one. If several are there
 *  anyway the newest wins, and it SAYS so: picking one in silence is how you end up reading a guide that
 *  does not match the code.
 *
 *  It returns the warning instead of logging it, so it stays independent of the logger — and testable.
 */
export const resolveDevTgz = (target: string, label: string): IDevTgzResolution => {
    if (!fs.existsSync(target)) return { warning: `[dev] '${label}' not found at ${target} — run its build first` }
    if (!fs.statSync(target).isDirectory()) return { tgz: target }

    const tgzs = fs.readdirSync(target).filter(f => f.endsWith('.tgz'))
    if (tgzs.length === 0) return { warning: `[dev] '${label}': no .tgz inside ${target} — run its build first` }
    if (tgzs.length === 1) return { tgz: path.join(target, tgzs[0]) }

    const newest = tgzs
        .map(f => ({ file: f, mtime: fs.statSync(path.join(target, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime)[0].file
    return {
        tgz: path.join(target, newest),
        warning: `[dev] '${label}': ${tgzs.length} tarballs in ${target}, using the newest (${newest}). Delete the stale ones.`
    }
}

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
