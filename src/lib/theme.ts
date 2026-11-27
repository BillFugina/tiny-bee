import { useSyncExternalStore } from 'react'

/**
 * Light (Honey) and dark themes. The page follows the device's setting until
 * the member flips the switch; their choice is kept in this browser. Choosing
 * the theme the device already asks for clears the choice, so the page goes
 * back to following the device.
 *
 * index.html runs the same lookup inline before the first paint, so the page
 * never flashes the wrong theme. Keep STORAGE_KEY in step with it.
 */
export type Theme = 'light' | 'dark'

export const STORAGE_KEY = 'tiny-bee:theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

// Holds the choice for this page when browser storage can't (private windows,
// blocked site data), so the switch still works until the page is closed.
let memoryChoice: Theme | null = null
let storageFailed = false

function readChoice(): Theme | null {
  if (storageFailed) return memoryChoice
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return memoryChoice
  }
}

function writeChoice(theme: Theme | null) {
  memoryChoice = theme
  try {
    if (theme) localStorage.setItem(STORAGE_KEY, theme)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    storageFailed = true
  }
}

function deviceTheme(): Theme {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

/** The theme the page should show: the member's choice, else the device's. */
export function currentTheme(): Theme {
  return readChoice() ?? deviceTheme()
}

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme
}

const listeners = new Set<() => void>()

function notify() {
  apply(currentTheme())
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const media = window.matchMedia(DARK_QUERY)
  // Follows the device while there's no choice; currentTheme ignores it otherwise.
  media.addEventListener('change', notify)
  // Keeps other tabs in step when the switch is flipped in one.
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) notify()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    media.removeEventListener('change', notify)
    window.removeEventListener('storage', onStorage)
  }
}

/** Flips to the other theme, remembering it only when it differs from the device. */
export function toggleTheme() {
  const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark'
  writeChoice(next === deviceTheme() ? null : next)
  notify()
}

/** The theme in effect, kept current as the device setting or the member's choice changes. */
export function useTheme(): Theme {
  // The server render (prerendered pages) has no device to ask; the inline
  // script in index.html sets the real theme before paint either way.
  return useSyncExternalStore(subscribe, currentTheme, () => 'light')
}
