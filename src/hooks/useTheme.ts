import { useEffect, useState } from 'react'
import { COLOR_THEME_KEY, THEME_KEY } from '../lib/defaults'
import type { ColorTheme, Theme } from '../lib/types'

const THEME_CHANGE_EVENT = 'budget-theme-change'
const themeColors: Record<ColorTheme, { light: string; dark: string }> = {
  chamomile: { light: '#f15b52', dark: '#241a2f' },
  sea: { light: '#168c91', dark: '#13282c' },
  'milk-tea': { light: '#a96f45', dark: '#261c17' },
  lavender: { light: '#8267b8', dark: '#21182b' },
}

function readColorTheme(): ColorTheme {
  const stored = localStorage.getItem(COLOR_THEME_KEY)
  return stored && stored in themeColors ? stored as ColorTheme : 'chamomile'
}

function updateBrowserColor() {
  const colorTheme = (document.documentElement.dataset.colorTheme as ColorTheme) || 'chamomile'
  const mode = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', (themeColors[colorTheme] || themeColors.chamomile)[mode])
}

function applyTheme(theme: Theme) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && prefersDark))
  updateBrowserColor()
}

function applyColorTheme(colorTheme: ColorTheme) {
  document.documentElement.dataset.colorTheme = colorTheme
  updateBrowserColor()
}

export function initializeTheme() {
  applyColorTheme(readColorTheme())
  applyTheme((localStorage.getItem(THEME_KEY) as Theme) || 'system')
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => (localStorage.getItem(THEME_KEY) as Theme) || 'system')
  const [colorTheme, setColorThemeState] = useState<ColorTheme>(readColorTheme)

  useEffect(() => {
    applyTheme(theme)
    applyColorTheme(colorTheme)
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = () => applyTheme(theme)
    const sync = () => {
      const nextTheme = (localStorage.getItem(THEME_KEY) as Theme) || 'system'
      const nextColorTheme = readColorTheme()
      setThemeState(nextTheme)
      setColorThemeState(nextColorTheme)
      applyTheme(nextTheme)
      applyColorTheme(nextColorTheme)
    }
    media.addEventListener('change', listener)
    window.addEventListener('storage', sync)
    window.addEventListener(THEME_CHANGE_EVENT, sync)
    return () => {
      media.removeEventListener('change', listener)
      window.removeEventListener('storage', sync)
      window.removeEventListener(THEME_CHANGE_EVENT, sync)
    }
  }, [theme, colorTheme])

  const setTheme = (next: Theme) => {
    localStorage.setItem(THEME_KEY, next)
    setThemeState(next)
    applyTheme(next)
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT))
  }

  const setColorTheme = (next: ColorTheme) => {
    localStorage.setItem(COLOR_THEME_KEY, next)
    setColorThemeState(next)
    applyColorTheme(next)
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT))
  }

  return { theme, setTheme, colorTheme, setColorTheme }
}
