import base from './playwright.config'
import { defineConfig } from '@playwright/test'

// TEMPORAL. El config del core excluye 'private/**' con y sin CAPTURES, asi que un capture-spec que
// vive en private no se puede lanzar con el. Este hereda todo lo demas y quita ese patron.
export default defineConfig({ ...base, testIgnore: [] })
