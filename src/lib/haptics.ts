// Tiny haptics helper.
//
// Android (Chrome / WebView / Firefox): navigator.vibrate works.
// iOS Safari / iOS PWA: there is currently no web API that can
// trigger system haptic feedback from JavaScript. Vibration API
// is not supported, and the <input type="checkbox" switch> haptic
// only fires for direct user touch on the switch element, not for
// programmatic clicks. iOS haptics require a native wrapper
// (e.g. Capacitor + @capacitor/haptics).
// On unsupported platforms this is a silent no-op.

type Kind = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'selection'

const PATTERNS: Record<Kind, number | number[]> = {
  selection: 6,
  light: 10,
  medium: 18,
  heavy: 28,
  success: [10, 35, 12],
  warning: [18, 60, 18],
}

export function haptic(kind: Kind = 'light'): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(PATTERNS[kind])
    }
  } catch {
    // Best-effort only.
  }
}
