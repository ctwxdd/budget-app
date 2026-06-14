import * as React from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BarChart3, CreditCard, Gift, Home, List, LogOut, Menu, Moon, Plus, Settings, Sun, X } from 'lucide-react'
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
  const mobileNav = nav.filter((item) => ['/', '/expenses', '/giftcards'].includes(item.to))
  const renderItem = (item: typeof nav[number]) => <NavLink key={item.to} to={item.to} className={({ isActive }) => `flex h-full min-h-[44px] flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-bold transition ${isActive ? 'text-coral' : 'text-muted-foreground'}`}><item.icon className="h-5 w-5" /><span className="leading-none">{item.label}</span></NavLink>
  return <nav className="fixed inset-x-0 bottom-0 z-40 md:hidden">
    <div className="relative mx-auto h-[68px] w-full border-t border-border/80 bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-18px_hsl(var(--foreground))] backdrop-blur-xl">
      <div className="grid h-full grid-cols-4 items-stretch px-2">
        {mobileNav.slice(0, 2).map(renderItem)}
        <div className="h-full" aria-hidden />
        {mobileNav.slice(2).map(renderItem)}
      </div>
      <Button aria-label="Add expense" variant="gradient" onClick={onAdd} className="absolute left-1/2 top-0 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full p-0 shadow-lift ring-4 ring-background transition hover:scale-[1.03]"><Plus className="h-7 w-7" /></Button>
    </div>
  </nav>
}

function MobileMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  React.useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onOpenChange(false)
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = originalOverflow; window.removeEventListener('keydown', onKey) }
  }, [open, onOpenChange])

  return <div className={`fixed inset-0 z-50 transition md:hidden ${open ? 'pointer-events-auto' : 'pointer-events-none'}`} aria-hidden={!open}>
    <button className={`absolute inset-0 bg-foreground/25 backdrop-blur-sm transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`} aria-label="Close navigation menu" onClick={() => onOpenChange(false)} />
    <aside className={`absolute inset-y-0 left-0 flex w-[min(86vw,22rem)] flex-col border-r border-border bg-card p-5 shadow-2xl transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="mb-6 flex items-center justify-between">
        <Link to="/" onClick={() => onOpenChange(false)} className="flex items-center gap-3">
          <img src="/icon-192.png" alt="" className="h-12 w-12 rounded-2xl shadow-lift" />
          <span><span className="block font-display text-lg font-bold">Budget Buddy</span><span className="text-xs text-muted-foreground">Soft money tracker</span></span>
        </Link>
        <Button variant="ghost" size="icon" aria-label="Close navigation menu" onClick={() => onOpenChange(false)}><X className="h-5 w-5" /></Button>
      </div>
      <nav className="space-y-1.5">{nav.map((item) => <NavLink key={item.to} to={item.to} onClick={() => onOpenChange(false)} className={({ isActive }) => `flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-semibold transition ${isActive ? 'bg-coral/10 text-coral' : 'text-muted-foreground hover:bg-accent/70 hover:text-accent-foreground'}`}><item.icon className="h-5 w-5" />{item.pageLabel}</NavLink>)}</nav>
    </aside>
  </div>
}

function AccountMenu({ onLogout }: { onLogout: () => void }) {
  const [open, setOpen] = React.useState(false)
  const { user } = useAuth()
  const name = user?.name || user?.email || 'Account'
  const initial = name.slice(0, 1).toUpperCase()

  React.useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [open])

  return <div className="relative" onClick={(event) => event.stopPropagation()}>
    <button title={user?.email} aria-label="Open account menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="grid h-10 w-10 place-items-center rounded-full bg-coral text-sm font-bold text-foreground ring-1 ring-coral/20 shadow-lift dark:text-white">{initial}</button>
    {open && <div className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-2xl border border-border bg-card p-2 shadow-2xl">
      <div className="border-b border-border px-3 py-2.5"><p className="truncate text-sm font-bold">{name}</p>{user?.email && user.email !== name && <p className="truncate text-xs text-muted-foreground">{user.email}</p>}</div>
      <Link to="/settings" onClick={() => setOpen(false)} className="mt-1 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-accent"><Settings className="h-4 w-4" />Settings</Link>
      <button onClick={onLogout} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-destructive hover:bg-destructive/10"><LogOut className="h-4 w-4" />Sign out</button>
    </div>}
  </div>
}

export function AppLayout() {
  const [expenseOpen, setExpenseOpen] = React.useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { theme, setTheme } = useTheme()
  const page = nav.find((item) => item.to === location.pathname) ?? nav[0]
  const cycleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark')
  const logout = () => { signOut(); localStorage.removeItem(SHEET_ID_KEY); navigate('/login') }
  return <div className="min-h-screen bg-background text-foreground [overflow-x:hidden] [overflow-x:clip]">
    <div className="fixed inset-y-0 left-0 hidden md:block"><Sidebar /></div>
    <div className="md:pl-72">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between relative border-b border-border/70 bg-background/85 px-3 backdrop-blur-xl md:h-20 md:px-8">
        <div className="flex min-w-0 items-center gap-2 md:gap-3"><Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation menu" onClick={() => setMobileMenuOpen(true)}><Menu className="h-5 w-5" /></Button><div className="hidden min-w-0 md:block"><p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">{page.emoji} {page.pageLabel}</p><h1 className="truncate font-display text-2xl font-extrabold">{page.pageLabel}</h1></div></div><h1 className="pointer-events-none absolute left-1/2 -translate-x-1/2 font-display text-lg font-extrabold md:hidden">{page.pageLabel}</h1>
        <div className="flex items-center gap-1.5 md:gap-2"><Button size="sm" className="hidden md:inline-flex" onClick={() => setExpenseOpen(true)}><Plus className="h-4 w-4" />Add expense</Button><Button variant="ghost" size="icon" onClick={cycleTheme} aria-label="Toggle theme">{theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</Button><AccountMenu onLogout={logout} /></div>
      </header>
      <main className="relative p-4 pb-28 md:p-8"><div className="soft-blob right-10 top-10 hidden h-56 w-56 bg-coral/20 md:block" /><ErrorBoundary resetKey={location.pathname}><Outlet context={{ openExpenseDialog: () => setExpenseOpen(true) }} /></ErrorBoundary></main>
    </div>
    <MobileMenu open={mobileMenuOpen} onOpenChange={setMobileMenuOpen} />
    <BottomNav onAdd={() => setExpenseOpen(true)} />
    <ExpenseDialog open={expenseOpen} onOpenChange={setExpenseOpen} />
  </div>
}
