import * as React from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BarChart3, CreditCard, Gift, Home, List, Moon, Plus, Settings, Sun } from 'lucide-react'
import { SHEET_ID_KEY } from '../../lib/defaults'
import { useAuth } from '../../lib/auth'
import { useTheme } from '../../hooks/useTheme'
import { Button } from '../ui'
import { ExpenseDialog } from '../expenses/ExpenseDialog'
import { ErrorBoundary } from '../ErrorBoundary'

const nav = [
  { to: '/', label: 'Home', pageLabel: 'Overview', emoji: '🏠', icon: Home },
  { to: '/expenses', label: 'Expenses', pageLabel: 'Expenses', emoji: '🧾', icon: List },
  { to: '/giftcards', label: 'Giftcards', pageLabel: 'Giftcards', emoji: '🎁', icon: Gift },
  { to: '/cards', label: 'Cards', pageLabel: 'Credit Cards', emoji: '💳', icon: CreditCard },
  { to: '/analytics', label: 'Analytics', pageLabel: 'Analytics', emoji: '📊', icon: BarChart3 },
  { to: '/settings', label: 'Settings', pageLabel: 'Settings', emoji: '⚙️', icon: Settings },
]

function Sidebar() {
  const { user } = useAuth()
  return <aside className="flex h-full w-72 flex-col border-r border-border/70 bg-white/85 p-5 backdrop-blur-xl dark:bg-card/85">
    <Link to="/" className="mb-8 flex items-center gap-3 rounded-3xl px-2 py-1">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-coral to-peach text-2xl shadow-lift">🪙</span>
      <span><span className="block font-display text-lg font-bold">{user?.name ? `Hi, ${user.name.split(' ')[0]} 👋` : 'Budget'}</span><span className="text-xs text-muted-foreground">Soft money tracker</span></span>
    </Link>
    <nav className="space-y-1.5">{nav.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => `relative flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${isActive ? 'bg-coral/10 text-coral before:absolute before:left-0 before:top-3 before:h-6 before:w-1 before:rounded-full before:bg-coral' : 'text-muted-foreground hover:bg-accent/70 hover:text-accent-foreground'}`}><item.icon className="h-4 w-4" />{item.pageLabel}</NavLink>)}</nav>
    <div className="mt-auto rounded-3xl border border-coral/15 bg-gradient-to-br from-coral/10 to-peach/20 p-4 text-sm text-muted-foreground shadow-soft"><p className="font-semibold text-foreground">💡 Tip</p><p>Tap + to log a new expense.</p></div>
  </aside>
}

function BottomNav({ onAdd }: { onAdd: () => void }) {
  const mobileNav = nav.filter((item) => !['/settings', '/analytics'].includes(item.to))
  const left = mobileNav.slice(0, 2)
  const right = mobileNav.slice(2)
  const renderItem = (item: typeof nav[number]) => <NavLink key={item.to} to={item.to} className={({ isActive }) => `flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition ${isActive ? 'text-coral' : 'text-muted-foreground'}`}><item.icon className="h-5 w-5" /><span>{item.label}</span></NavLink>
  return <nav className="fixed inset-x-0 bottom-0 z-40 md:hidden">
    <div className="mx-auto flex h-16 max-w-md items-start justify-between border-t border-border/80 bg-card/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-18px_hsl(var(--foreground))] backdrop-blur-xl">
      {left.map(renderItem)}
      <Button aria-label="Add expense" variant="gradient" onClick={onAdd} className="-mt-7 h-14 w-14 shrink-0 rounded-full p-0 ring-4 ring-background hover:scale-[1.03]"><Plus className="h-7 w-7" /></Button>
      {right.map(renderItem)}
    </div>
  </nav>
}

export function AppLayout() {
  const [expenseOpen, setExpenseOpen] = React.useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const { theme, setTheme } = useTheme()
  const page = nav.find((item) => item.to === location.pathname) ?? nav[0]
  const cycleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark')
  const logout = () => { signOut(); localStorage.removeItem(SHEET_ID_KEY); navigate('/login') }
  return <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
    <div className="fixed inset-y-0 left-0 hidden md:block"><Sidebar /></div>
    <div className="md:pl-72">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between relative border-b border-border/70 bg-background/85 px-3 backdrop-blur-xl md:h-20 md:px-8">
        <div className="flex min-w-0 items-center gap-2 md:gap-3"><span className="grid h-9 w-9 place-items-center rounded-2xl bg-coral/10 text-lg md:hidden">{page.emoji}</span><div className="hidden min-w-0 md:block"><p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">{page.emoji} {page.pageLabel}</p><h1 className="truncate font-display text-2xl font-extrabold">{page.pageLabel}</h1></div></div><h1 className="pointer-events-none absolute left-1/2 -translate-x-1/2 font-display text-lg font-extrabold md:hidden">{page.pageLabel}</h1>
        <div className="flex items-center gap-1.5 md:gap-2"><Button size="sm" className="hidden md:inline-flex" onClick={() => setExpenseOpen(true)}><Plus className="h-4 w-4" />Add expense</Button><Button variant="ghost" size="icon" onClick={cycleTheme} aria-label="Toggle theme">{theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</Button><button title={user?.email} className="grid h-10 w-10 place-items-center rounded-full bg-coral text-sm font-bold text-foreground ring-1 ring-coral/20 shadow-lift dark:text-white">{(user?.email || user?.name || 'U').slice(0, 1).toUpperCase()}</button><Button variant="outline" size="sm" className="hidden md:inline-flex" onClick={logout}>Sign out</Button></div>
      </header>
      <main className="relative p-4 pb-24 md:p-8"><div className="soft-blob right-10 top-10 hidden h-56 w-56 bg-coral/20 md:block" /><ErrorBoundary resetKey={location.pathname}><Outlet context={{ openExpenseDialog: () => setExpenseOpen(true) }} /></ErrorBoundary></main>
    </div>
    <BottomNav onAdd={() => setExpenseOpen(true)} />
    <ExpenseDialog open={expenseOpen} onOpenChange={setExpenseOpen} />
  </div>
}
