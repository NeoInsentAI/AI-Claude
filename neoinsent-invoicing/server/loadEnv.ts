import fs from 'node:fs'
import path from 'node:path'

/** `<project root>/.env` — holds local secrets such as the Gmail app password (gitignored). */
export const PROJECT_ENV_FILE = path.resolve(import.meta.dirname, '..', '.env')

/**
 * Loads `file` into process.env with Node's built-in parser if it exists; returns whether it did.
 * Variables already set in the environment win over the file.
 */
export function loadEnvFileIfPresent(file: string = PROJECT_ENV_FILE): boolean {
  if (!fs.existsSync(file)) return false
  process.loadEnvFile(file)
  return true
}
