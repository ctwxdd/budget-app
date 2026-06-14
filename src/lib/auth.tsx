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
  login: () => Promise<void>
  switchAccount: () => Promise<void>
  signOut: () => void
  withFreshToken: () => Promise<string>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function readToken() {
  const token = localStorage.getItem(TOKEN_KEY) || ''
  const expiresAt = Number(localStorage.getItem(TOKEN_EXPIRES_KEY) || 0)
  return { token, expiresAt }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initial = readToken()
  const [token, setToken] = useState(initial.token)
  const [expiresAt, setExpiresAt] = useState(initial.expiresAt)
  const [user, setUser] = useState<UserInfo | null>(() => JSON.parse(localStorage.getItem('budget.user') || 'null'))
  const pendingLogin = useRef<(() => void) | null>(null)
  const pendingError = useRef<((error: unknown) => void) | null>(null)

  const persistToken = useCallback((accessToken: string, expiresIn = 3600) => {
    const safeExpiresAt = Date.now() + expiresIn * 1000 - 60000
    localStorage.setItem(TOKEN_KEY, accessToken)
    localStorage.setItem(TOKEN_EXPIRES_KEY, String(safeExpiresAt))
    setToken(accessToken)
    setExpiresAt(safeExpiresAt)
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

  const googleLogin = useGoogleLogin({
    flow: 'implicit',
    scope: 'https://www.googleapis.com/auth/spreadsheets openid email profile',
    onSuccess: (response) => {
      persistToken(response.access_token, response.expires_in)
      void fetchUser(response.access_token)
      pendingLogin.current?.()
      pendingLogin.current = null
      pendingError.current = null
    },
    onError: (error) => {
      pendingError.current?.(error)
      pendingLogin.current = null
      pendingError.current = null
    },
  })

  const googleSwitch = useGoogleLogin({
    flow: 'implicit',
    scope: 'https://www.googleapis.com/auth/spreadsheets openid email profile',
    prompt: 'select_account',
    onSuccess: (response) => {
      persistToken(response.access_token, response.expires_in)
      void fetchUser(response.access_token)
      pendingLogin.current?.()
      pendingLogin.current = null
      pendingError.current = null
    },
    onError: (error) => {
      pendingError.current?.(error)
      pendingLogin.current = null
      pendingError.current = null
    },
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
    setToken('')
    setExpiresAt(0)
    setUser(null)
    pendingLogin.current = resolve
    pendingError.current = reject
    googleSwitch()
  }), [googleSwitch])

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(TOKEN_EXPIRES_KEY)
    localStorage.removeItem('budget.user')
    setToken('')
    setExpiresAt(0)
    setUser(null)
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

  const value = useMemo(() => ({ token, expiresAt, user, isAuthenticated: Boolean(token && expiresAt > Date.now()), login, switchAccount, signOut, withFreshToken }), [token, expiresAt, user, login, switchAccount, signOut, withFreshToken])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
