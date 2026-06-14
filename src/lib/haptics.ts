// Tiny haptics helper.
//
// Android Chrome / most Android browsers: navigator.vibrate works.
// iOS Safari / iOS PWA: no vibrate API. We fall back to the
// hidden `<label><input type="checkbox" switch></label>` trick,
// which plays the native switch haptic on iOS 17.4+.
// Everywhere else this is a silent no-op.

type Kind = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'selection'

const PATTERNS: Record<Kind, number | number[]> = {
  selection: 6,
  light: 10,
  medium: 18,
  heavy: 28,
  success: [10, 35, 12],
  warning: [18, 60, 18],
}

let switchLabel: HTMLLabelElement | null = null
let switchSupported: boolean | null = null

function ensureSwitch(): HTMLLabelElement | null {
  if (typeof document === 'undefined') return null
  if (switchLabel && switchLabel.isConnected) return switchLabel
  const label = document.createElement('label')
  label.setAttribute('aria-hidden', 'true')
  label.style.cssText =
    'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;'
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.setAttribute('switch', '')
  input.tabIndex = -1
  label.appendChild(input)
  document.body.appendChild(label)
  switchLabel = label
  if (switchSupported === null) {
    // Feature-detect: if the `switch` attribute is recognized, the element
    // exposes a non-null `role` of "switch".
    switchSupported = (input as unknown as { role?: string }).role === 'switch' ||
      input.getAttribute('switch') !== null
  }
  return label
}

export function haptic(kind: Kind = 'light'): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      if (navigator.vibrate(PATTERNS[kind])) return
    }
    const label = ensureSwitch()
    if (label) label.click()
  } catch {
    // Swallow - haptics are always best-effort.
  }
}
