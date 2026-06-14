import { useEffect, useState } from 'react'
import { COLOR_THEME_KEY, THEME_KEY } from '../lib/defaults'
import type { ColorTheme, Theme } from '../lib/types'

const THEME_CHANGE_EVENT = 'budget-theme-change'
const themeColors: Record<ColorTheme, { light: string; dark: string }> = {
  coral: { light: '#faf6f4', dark: '#241a2f' },
  chamomile: { light: '#fffaf0', dark: '#292116' },
  sea: { light: '#f2f8f8', dark: '#13282c' },
  'milk-tea': { light: '#f8f3eb', dark: '#261c17' },
  lavender: { light: '#f8f5fa', dark: '#21182b' },
}

function readColorTheme(): ColorTheme {
  const stored = localStorage.getItem(COLOR_THEME_KEY)
  return stored && stored in themeColors ? stored as ColorTheme : 'coral'
}

function updateBrowserColor() {
  const colorTheme = (document.documentElement.dataset.colorTheme as ColorTheme) || 'coral'
  const mode = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  const color = (themeColors[colorTheme] || themeColors.coral)[mode]
  document.documentElement.style.colorScheme = mode
  document.documentElement.style.backgroundColor = color
  document.body?.style.setProperty('background-color', color)

  // Replacing the node makes installed iOS web apps re-evaluate the status-bar color.
  const current = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  const next = document.createElement('meta')
  next.name = 'theme-color'
  next.content = color
  current?.replaceWith(next)
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
