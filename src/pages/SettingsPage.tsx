import { useNavigate } from 'react-router-dom'
import { SHEET_ID_KEY } from '../lib/defaults'
import { useAuth } from '../lib/auth'
import { useTheme } from '../hooks/useTheme'
import { useExpenses, useSheetId } from '../hooks/useExpenses'
import { displayDate } from '../lib/format'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Select } from '../components/ui'
import type { ColorTheme, Theme } from '../lib/types'

const colorThemes: { id: ColorTheme; name: string; description: string; colors: string[] }[] = [
  { id: 'chamomile', name: 'Chamomile', description: 'Warm coral and sunny petals', colors: ['#f15b52', '#ff9a73', '#ffd85f'] },
  { id: 'sea', name: 'Sea Glass', description: 'Calm teal and ocean blue', colors: ['#168c91', '#55b9bd', '#8bd4e5'] },
  { id: 'milk-tea', name: 'Milk Tea', description: 'Cozy caramel and creamy beige', colors: ['#a96f45', '#d3a477', '#ead5b8'] },
  { id: 'lavender', name: 'Lavender', description: 'Soft violet and berry blossom', colors: ['#8267b8', '#ad8ed8', '#e4b4d2'] },
]

export function SettingsPage() {
  const sheetId = useSheetId()
  const { user, signOut } = useAuth()
  const { theme, setTheme, colorTheme, setColorTheme } = useTheme()
  const { data = [] } = useExpenses()
  const navigate = useNavigate()
  const dates = data.map((expense) => expense.date).sort()
  const logout = () => { signOut(); localStorage.removeItem(SHEET_ID_KEY); navigate('/login') }
  return <div className="grid gap-5 md:gap-6"><Card><CardHeader><CardTitle>Spreadsheet</CardTitle><CardDescription>Google Sheets database connection.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="rounded-3xl bg-accent/60 p-4 font-mono text-sm break-all text-muted-foreground">{sheetId}</div><Button variant="outline" className="w-full sm:w-auto" onClick={() => navigate('/setup')}>Change spreadsheet</Button></CardContent></Card><Card><CardHeader><CardTitle>Account</CardTitle><CardDescription>Signed in with Google.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-full bg-coral font-bold text-foreground ring-1 ring-coral/20 shadow-lift dark:text-white">{(user?.email || user?.name || 'U').slice(0, 1).toUpperCase()}</span><p className="min-w-0 break-all text-sm font-semibold">{user?.email || 'Profile email unavailable'}</p></div><Button variant="destructive" className="w-full sm:w-auto" onClick={logout}>Sign out</Button></CardContent></Card><Card><CardHeader><CardTitle>Appearance</CardTitle><CardDescription>Choose a color palette and brightness. Saved on this device.</CardDescription></CardHeader><CardContent className="space-y-5"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{colorThemes.map((option) => <button key={option.id} type="button" aria-pressed={colorTheme === option.id} onClick={() => setColorTheme(option.id)} className={`rounded-3xl border p-3 text-left transition active:scale-[0.98] ${colorTheme === option.id ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'bg-card hover:bg-accent/40'}`}><span className="mb-3 flex gap-1.5">{option.colors.map((color) => <span key={color} className="h-7 flex-1 rounded-full" style={{ backgroundColor: color }} />)}</span><span className="block text-sm font-bold">{option.name}</span><span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{option.description}</span></button>)}</div><div><p className="mb-2 text-sm font-semibold">Brightness</p><Select value={theme} onChange={(event) => setTheme(event.target.value as Theme)}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></Select></div></CardContent></Card><Card><CardHeader><CardTitle>Data counts</CardTitle></CardHeader><CardContent className="grid gap-3 text-sm sm:grid-cols-3"><div className="rounded-3xl bg-coral/10 p-4"><p className="text-muted-foreground">Total</p><p className="font-display text-2xl font-extrabold">{data.length}</p></div><div className="rounded-3xl bg-sky/15 p-4"><p className="text-muted-foreground">Oldest</p><p className="font-medium">{dates[0] ? displayDate(dates[0]) : '—'}</p></div><div className="rounded-3xl bg-mint/15 p-4"><p className="text-muted-foreground">Newest</p><p className="font-medium">{dates.at(-1) ? displayDate(dates.at(-1)!) : '—'}</p></div></CardContent></Card></div>
}
