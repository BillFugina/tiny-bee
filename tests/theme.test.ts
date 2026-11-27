import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function fakeStorage(opts: { blockWrites?: boolean; blockAll?: boolean } = {}) {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => {
      if (opts.blockAll) throw new Error('blocked')
      return data.get(k) ?? null
    },
    setItem: (k: string, v: string) => {
      if (opts.blockAll || opts.blockWrites) throw new Error('blocked')
      data.set(k, v)
    },
    removeItem: (k: string) => {
      if (opts.blockAll || opts.blockWrites) throw new Error('blocked')
      data.delete(k)
    },
  }
}

function setup(deviceDark: boolean, storage: ReturnType<typeof fakeStorage>) {
  const html = { dataset: {} as Record<string, string> }
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('document', { documentElement: html })
  vi.stubGlobal('window', {
    matchMedia: () => ({ matches: deviceDark, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {},
    removeEventListener() {},
  })
  return html
}

describe('theme', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.unstubAllGlobals())

  it('follows the device until the member picks, and forgets a pick that matches the device', async () => {
    const storage = fakeStorage()
    const html = setup(false, storage)
    const theme = await import('../src/lib/theme')
    expect(theme.currentTheme()).toBe('light')
    theme.toggleTheme()
    expect(theme.currentTheme()).toBe('dark')
    expect(storage.getItem(theme.STORAGE_KEY)).toBe('dark')
    expect(html.dataset.theme).toBe('dark')
    theme.toggleTheme()
    expect(theme.currentTheme()).toBe('light')
    expect(storage.getItem(theme.STORAGE_KEY)).toBeNull()
  })

  it('keeps the switch working when storage writes are blocked', async () => {
    const html = setup(false, fakeStorage({ blockWrites: true }))
    const theme = await import('../src/lib/theme')
    theme.toggleTheme()
    expect(theme.currentTheme()).toBe('dark')
    expect(html.dataset.theme).toBe('dark')
    theme.toggleTheme()
    expect(theme.currentTheme()).toBe('light')
  })

  it('keeps the switch working when storage is off entirely', async () => {
    const html = setup(true, fakeStorage({ blockAll: true }))
    const theme = await import('../src/lib/theme')
    expect(theme.currentTheme()).toBe('dark')
    theme.toggleTheme()
    expect(theme.currentTheme()).toBe('light')
    expect(html.dataset.theme).toBe('light')
  })
})
