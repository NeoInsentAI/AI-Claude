// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadEnvFileIfPresent } from './loadEnv'

const KEY = 'NEOINSENT_LOADENV_TEST'
let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neoinsent-env-'))
  delete process.env[KEY]
})

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env[KEY]
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('loadEnvFileIfPresent', () => {
  it('skips a missing file without calling process.loadEnvFile', () => {
    const spy = vi.spyOn(process, 'loadEnvFile')
    expect(loadEnvFileIfPresent(path.join(dir, '.env'))).toBe(false)
    expect(spy).not.toHaveBeenCalled()
    expect(process.env[KEY]).toBeUndefined()
  })

  it('loads the variables from an existing file', () => {
    const file = path.join(dir, '.env')
    fs.writeFileSync(file, `${KEY}=hello\n`)
    expect(loadEnvFileIfPresent(file)).toBe(true)
    expect(process.env[KEY]).toBe('hello')
  })

  it('does not override a variable already set in the environment', () => {
    const file = path.join(dir, '.env')
    fs.writeFileSync(file, `${KEY}=from-file\n`)
    process.env[KEY] = 'from-shell'
    loadEnvFileIfPresent(file)
    expect(process.env[KEY]).toBe('from-shell')
  })
})
