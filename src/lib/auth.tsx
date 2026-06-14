import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useGoogleLogin } from '@react-oauth/google'
import { TOKEN_EXPIRES_KEY, TOKEN_KEY } from './defaults'
import { setSheetsAuth } from './sheets'

type UserInfo = { email?: string; name?: string; picture?: string }
type AuthContextValue = {
  token: string
  expiresAt: number
  user: UserInfo | null
  isAuthenticated: boolean
  hasSheetsScope: boolean
  login: () => Promise<void>
  switchAccount: () => Promise<void>
  reauthorize: () => Promise<void>
  signOut: () => void
  withFreshToken: () => Promise<string>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets'
const SCOPE_KEY = 'budget.scope'

function readToken() {
  const token = localStorage.getItem(TOKEN_KEY) || ''
  const expiresAt = Number(localStorage.getItem(TOKEN_EXPIRES_KEY) || 0)
  return { token, expiresAt }
}

function hasSheets(scope: string) {
  return scope.split(/\s+/).includes(SHEETS_SCOPE)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initial = readToken()
  const [token, setToken] = useState(initial.token)
  const [expiresAt, setExpiresAt] = useState(initial.expiresAt)
  const [grantedScope, setGrantedScope] = useState<string>(() => localStorage.getItem(SCOPE_KEY) || '')
  const [user, setUser] = useState<UserInfo | null>(() => JSON.parse(localStorage.getItem('budget.user') || 'null'))
  const pendingLogin = useRef<(() => void) | null>(null)
  const pendingError = useRef<((error: unknown) => void) | null>(null)

  const persistToken = useCallback((accessToken: string, expiresIn = 3600, scope = '') => {
    const safeExpiresAt = Date.now() + expiresIn * 1000 - 60000
    localStorage.setItem(TOKEN_KEY, accessToken)
    localStorage.setItem(TOKEN_EXPIRES_KEY, String(safeExpiresAt))
    if (scope) localStorage.setItem(SCOPE_KEY, scope)
    setToken(accessToken)
    setExpiresAt(safeExpiresAt)
    if (scope) setGrantedScope(scope)
  }, [])

  const fetchUser = useCallback(async (accessToken: string) => {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } })
      if (!response.ok) return
      const profile = (await response.json()) as UserInfo
      setUser(profile)
      localStorage.setItem('budget.user', JSON.stringify(profile))
    } catch {
      // Profile is nice-to-have only.
    }
  }, [])

  const handleSuccess = useCallback((response: { access_token: string; expires_in: number; scope?: string }) => {
    const scope = response.scope || ''
    persistToken(response.access_token, response.expires_in, scope)
    void fetchUser(response.access_token)
    if (!hasSheets(scope)) {
      const err = new Error('SHEETS_SCOPE_MISSING')
      pendingError.current?.(err)
    } else {
      pendingLogin.current?.()
    }
    pendingLogin.current = null
    pendingError.current = null
  }, [persistToken, fetchUser])

  const handleError = useCallback((error: unknown) => {
    pendingError.current?.(error)
    pendingLogin.current = null
    pendingError.current = null
  }, [])

  const googleLogin = useGoogleLogin({
    flow: 'implicit',
    scope: `${SHEETS_SCOPE} openid email profile`,
    onSuccess: handleSuccess,
    onError: handleError,
  })

  const googleSwitch = useGoogleLogin({
    flow: 'implicit',
    scope: `${SHEETS_SCOPE} openid email profile`,
    prompt: 'select_account',
    onSuccess: handleSuccess,
    onError: handleError,
  })

  const googleReauthorize = useGoogleLogin({
    flow: 'implicit',
    scope: `${SHEETS_SCOPE} openid email profile`,
    prompt: 'consent',
    onSuccess: handleSuccess,
    onError: handleError,
  })

  const login = useCallback(() => new Promise<void>((resolve, reject) => {
    pendingLogin.current = resolve
    pendingError.current = reject
    googleLogin()
  }), [googleLogin])

  const switchAccount = useCallback(() => new Promise<void>((resolve, reject) => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(TOKEN_EXPIRES_KEY)
    localStorage.removeItem('budget.user')
    localStorage.removeItem(SCOPE_KEY)
    setToken('')
    setExpiresAt(0)
    setUser(null)
    setGrantedScope('')
    pendingLogin.current = resolve
    pendingError.current = reject
    googleSwitch()
  }), [googleSwitch])

  const reauthorize = useCallback(() => new Promise<void>((resolve, reject) => {
    pendingLogin.current = resolve
    pendingError.current = reject
    googleReauthorize()
  }), [googleReauthorize])

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(TOKEN_EXPIRES_KEY)
    localStorage.removeItem('budget.user')
    localStorage.removeItem(SCOPE_KEY)
    setToken('')
    setExpiresAt(0)
    setUser(null)
    setGrantedScope('')
  }, [])

  const withFreshToken = useCallback(async () => {
    const latest = readToken()
    if (latest.token && latest.expiresAt > Date.now()) return latest.token
    await login()
    const refreshed = readToken()
    if (!refreshed.token) throw new Error('Google sign-in is required.')
    return refreshed.token
  }, [login])

  useEffect(() => {
    setSheetsAuth({ getToken: withFreshToken, onUnauthorized: signOut })
  }, [withFreshToken, signOut])

  const value = useMemo(() => ({
    token,
    expiresAt,
    user,
    isAuthenticated: Boolean(token && expiresAt > Date.now()),
    hasSheetsScope: hasSheets(grantedScope),
    login,
    switchAccount,
    reauthorize,
    signOut,
    withFreshToken,
  }), [token, expiresAt, user, grantedScope, login, switchAccount, reauthorize, signOut, withFreshToken])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
