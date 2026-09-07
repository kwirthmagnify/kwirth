// Config auxiliar para lanzar a mano los specs 'capture-*' (el config por defecto los ignora a proposito:
// sobrescriben las capturas de la guia). Uso: playwright test --config playwright.capture.config.ts <spec>
import base from './playwright.config'
export default { ...base, testIgnore: ['**/private/**'] }
