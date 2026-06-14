import { useLocation, useNavigate } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { SHEET_ID_KEY } from '../lib/defaults'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const missingClientId = !import.meta.env.VITE_GOOGLE_CLIENT_ID
  const onLogin = async () => {
    await login()
    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname
    const hasSheet = Boolean(localStorage.getItem(SHEET_ID_KEY))
    navigate(from || (hasSheet ? '/' : '/setup'), { replace: true })
  }
  return <div className="relative grid min-h-screen place-items-center overflow-hidden bg-gradient-to-br from-background via-orange-50 to-rose-50 p-4 dark:from-background dark:via-background dark:to-card sm:p-6"><div className="soft-blob left-4 top-8 h-48 w-48 bg-coral/25 md:left-10 md:h-72 md:w-72" /><div className="soft-blob bottom-10 right-4 h-48 w-48 bg-sky/20 md:right-10 md:h-72 md:w-72" /><Card className="w-full max-w-lg bg-white/92 backdrop-blur dark:bg-card/90"><CardHeader className="text-center"><div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-[2rem] bg-gradient-to-br from-coral to-peach text-4xl shadow-lift">🪙</div><p className="text-sm font-bold uppercase tracking-[0.28em] text-coral">Budget Buddy</p><CardTitle className="text-3xl md:text-4xl">Personal Budget Tracker</CardTitle><CardDescription>Track spending in a cute, modern app while keeping Google Sheets as your database.</CardDescription></CardHeader><CardContent className="space-y-4">{missingClientId ? <div className="rounded-3xl border border-butter bg-butter/20 p-4 text-sm text-amber-900 dark:text-butter"><p className="font-semibold">Google Client ID is missing.</p><p>Follow README setup, copy .env.example to .env.local, and set VITE_GOOGLE_CLIENT_ID.</p></div> : <Button className="h-12 w-full text-base" size="lg" onClick={onLogin}><Sparkles className="h-5 w-5" />Sign in with Google</Button>}<p className="text-center text-xs text-muted-foreground">Requires Google Sheets access plus openid/email/profile.</p></CardContent></Card></div>
}
