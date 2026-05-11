/*
Copyright 2024 Julio Fernandez

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

/**
 * 
 * @param version1 version to check against a specifi level
 * @param version2 level you want to compare to
 * @returns true if version1 version is higher than version2
 */
const versionGreatOrEqualThan = (version1: string, version2: string): boolean => {
    return versionGreaterThan(version1, version2) || (version1===version2)
}

const versionGreaterThan = (version1: string, version2: string): boolean => {
    const v1 = version1.split('.').map(Number)
    const v2 = version2.split('.').map(Number)
  
    for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
        const num1 = v1[i] || 0
        const num2 = v2[i] || 0

        if (num1 > num2)
            return true
        else if (num1 < num2)
            return false
    }
    // versions are equal
    return false
}

export { versionGreatOrEqualThan, versionGreaterThan }