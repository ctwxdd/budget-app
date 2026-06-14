import { useNavigate } from 'react-router-dom'
import { SHEET_ID_KEY } from '../lib/defaults'
import { useAuth } from '../lib/auth'
import { useTheme } from '../hooks/useTheme'
import { useExpenses, useSheetId } from '../hooks/useExpenses'
import { displayDate } from '../lib/format'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Select } from '../components/ui'
import type { Theme } from '../lib/types'

export function SettingsPage() {
  const sheetId = useSheetId()
  const { user, signOut } = useAuth()
  const { theme, setTheme } = useTheme()
  const { data = [] } = useExpenses()
  const navigate = useNavigate()
  const dates = data.map((expense) => expense.date).sort()
  const logout = () => { signOut(); localStorage.removeItem(SHEET_ID_KEY); navigate('/login') }
  return <div className="grid gap-5 md:gap-6"><Card><CardHeader><CardTitle>Spreadsheet</CardTitle><CardDescription>Google Sheets database connection.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="rounded-3xl bg-accent/60 p-4 font-mono text-sm break-all text-muted-foreground">{sheetId}</div><Button variant="outline" className="w-full sm:w-auto" onClick={() => navigate('/setup')}>Change spreadsheet</Button></CardContent></Card><Card><CardHeader><CardTitle>Account</CardTitle><CardDescription>Signed in with Google.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-full bg-coral font-bold text-foreground ring-1 ring-coral/20 shadow-lift dark:text-white">{(user?.email || user?.name || 'U').slice(0, 1).toUpperCase()}</span><p className="min-w-0 break-all text-sm font-semibold">{user?.email || 'Profile email unavailable'}</p></div><Button variant="destructive" className="w-full sm:w-auto" onClick={logout}>Sign out</Button></CardContent></Card><Card><CardHeader><CardTitle>Theme</CardTitle><CardDescription>Choose Light, Dark, or System.</CardDescription></CardHeader><CardContent><Select value={theme} onChange={(event) => setTheme(event.target.value as Theme)}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></Select></CardContent></Card><Card><CardHeader><CardTitle>Data counts</CardTitle></CardHeader><CardContent className="grid gap-3 text-sm sm:grid-cols-3"><div className="rounded-3xl bg-coral/10 p-4"><p className="text-muted-foreground">Total</p><p className="font-display text-2xl font-extrabold">{data.length}</p></div><div className="rounded-3xl bg-sky/15 p-4"><p className="text-muted-foreground">Oldest</p><p className="font-medium">{dates[0] ? displayDate(dates[0]) : '—'}</p></div><div className="rounded-3xl bg-mint/15 p-4"><p className="text-muted-foreground">Newest</p><p className="font-medium">{dates.at(-1) ? displayDate(dates.at(-1)!) : '—'}</p></div></CardContent></Card></div>
}
