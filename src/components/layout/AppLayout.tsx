import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BarChart3, CreditCard, Gift, Home, List, LogOut, Menu, Moon, Plus, RefreshCw, Settings, Sun, X } from 'lucide-react'
import { SHEET_ID_KEY } from '../../lib/defaults'
import { useAuth } from '../../lib/auth'
import { useTheme } from '../../hooks/useTheme'
import { Button } from '../ui'
import { ExpenseDialog } from '../expenses/ExpenseDialog'
import { ErrorBoundary } from '../ErrorBoundary'
import { LoveNoteIcon } from '../LoveNoteIcon'

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
    <div className="mb-8 flex items-center gap-3 rounded-3xl px-2 py-1">
      <LoveNoteIcon imageClassName="h-12 w-12 rounded-2xl shadow-lift" />
      <Link to="/"><span className="block font-display text-lg font-bold">{user?.name ? `Hi, ${user.name.split(' ')[0]} 👋` : 'Chamomile Pocket'}</span><span className="text-xs text-muted-foreground">A cozy money tracker</span></Link>
    </div>
    <nav className="space-y-1.5">{nav.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => `relative flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${isActive ? 'bg-coral/10 text-coral before:absolute before:left-0 before:top-3 before:h-6 before:w-1 before:rounded-full before:bg-coral' : 'text-muted-foreground hover:bg-accent/70 hover:text-accent-foreground'}`}><item.icon className="h-4 w-4" />{item.pageLabel}</NavLink>)}</nav>
    <div className="mt-auto rounded-3xl border border-coral/15 bg-gradient-to-br from-coral/10 to-peach/20 p-4 text-sm text-muted-foreground shadow-soft"><p className="font-semibold text-foreground">💡 Tip</p><p>Tap + to log a new expense.</p></div>
  </aside>
}

function BottomNav({ onAdd }: { onAdd: () => void }) {
  const mobileNav = nav.filter((item) => ['/', '/expenses', '/analytics', '/giftcards'].includes(item.to))
  const renderItem = (item: typeof nav[number]) => <NavLink key={item.to} to={item.to} className={({ isActive }) => `flex h-[68px] min-w-0 flex-col items-center justify-center gap-1 px-0.5 pb-1 pt-2 text-[10px] font-bold transition sm:text-[11px] ${isActive ? 'text-coral' : 'text-muted-foreground'}`}><item.icon className="h-5 w-5 shrink-0" /><span className="max-w-full truncate leading-none">{item.label}</span></NavLink>
  return <nav className="fixed inset-x-0 bottom-0 z-40 md:hidden">
    <div className="relative mx-auto h-[calc(68px+env(safe-area-inset-bottom))] w-full border-t border-border/80 bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-18px_hsl(var(--foreground))] backdrop-blur-xl">
      <div className="mobile-bottom-items grid h-[68px] grid-cols-5 items-stretch px-1">
        {mobileNav.slice(0, 2).map(renderItem)}
        <div className="h-full" aria-hidden />
        {mobileNav.slice(2).map(renderItem)}
      </div>
      <Button aria-label="Add expense" variant="gradient" onClick={onAdd} className="mobile-bottom-add absolute left-1/2 top-0 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full p-0 shadow-lift ring-4 ring-background transition hover:scale-[1.03]"><Plus className="h-7 w-7" /></Button>
    </div>
  </nav>
}

function PullToRefresh() {
  const queryClient = useQueryClient()
  const [distance, setDistance] = React.useState(0)
  const [refreshing, setRefreshing] = React.useState(false)
  const startY = React.useRef<number | null>(null)
  const distanceRef = React.useRef(0)
  const refreshingRef = React.useRef(false)
  const threshold = 64

  React.useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (!standalone) return

    const onTouchStart = (event: TouchEvent) => {
      if (refreshingRef.current || event.touches.length !== 1 || window.scrollY > 0 || document.body.style.overflow === 'hidden') return
      startY.current = event.touches[0].clientY
      document.documentElement.dataset.pulling = 'true'
    }
    const onTouchMove = (event: TouchEvent) => {
      if (startY.current === null || window.scrollY > 0) return
      const delta = event.touches[0].clientY - startY.current
      if (delta <= 0) { distanceRef.current = 0; setDistance(0); return }
      event.preventDefault()
      distanceRef.current = Math.min(82, delta * 0.45)
      setDistance(distanceRef.current)
      document.documentElement.style.setProperty('--pull-distance', `${distanceRef.current}px`)
    }
    const onTouchEnd = () => {
      if (startY.current === null) return
      startY.current = null
      delete document.documentElement.dataset.pulling
      if (distanceRef.current >= threshold) {
        refreshingRef.current = true
        setRefreshing(true)
        distanceRef.current = 0
        setDistance(0)
        document.documentElement.style.setProperty('--pull-distance', '0px')
        void queryClient.refetchQueries({ type: 'active' }).finally(() => {
          window.setTimeout(() => {
            refreshingRef.current = false
            setRefreshing(false)
          }, 420)
        })
      } else {
        distanceRef.current = 0
        setDistance(0)
        document.documentElement.style.setProperty('--pull-distance', '0px')
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('touchcancel', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
      delete document.documentElement.dataset.pulling
      document.documentElement.style.removeProperty('--pull-distance')
    }
  }, [queryClient])

  if (!distance && !refreshing) return null
  return <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[60] flex justify-center" style={{ transform: `translateY(${Math.max(0, distance - 48)}px)` }}>
    <div className="flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-2 text-xs font-semibold text-muted-foreground shadow-lift backdrop-blur-xl">
      <RefreshCw className={`h-4 w-4 text-coral ${refreshing ? 'animate-spin' : distance >= threshold ? 'rotate-180' : ''}`} />
      {refreshing ? 'Refreshing...' : distance >= threshold ? 'Release to refresh' : 'Pull to refresh'}
    </div>
  </div>
}

function MobileMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user } = useAuth()
  const firstName = user?.name?.trim().split(/\s+/)[0]
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
    <aside className={`absolute inset-y-0 left-0 flex w-[min(86vw,22rem)] flex-col border-r border-border bg-card px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))] shadow-2xl transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <LoveNoteIcon imageClassName="h-12 w-12 rounded-2xl shadow-lift" />
          <Link to="/" onClick={() => onOpenChange(false)} className="min-w-0"><span className="block truncate font-display text-lg font-bold">{firstName ? `Hi, ${firstName} 👋` : 'Welcome 👋'}</span><span className="block truncate text-xs text-muted-foreground">Chamomile Pocket · A cozy money tracker</span></Link>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close navigation menu" onClick={() => onOpenChange(false)}><X className="h-5 w-5" /></Button>
      </div>
      <nav className="space-y-1.5">{nav.map((item) => <NavLink key={item.to} to={item.to} onClick={() => onOpenChange(false)} className={({ isActive }) => `flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-semibold transition ${isActive ? 'bg-coral/10 text-coral' : 'text-muted-foreground hover:bg-accent/70 hover:text-accent-foreground'}`}><item.icon className="h-5 w-5" />{item.pageLabel}</NavLink>)}</nav>
    </aside>
  </div>
}

function AccountMenu({ onLogout }: { onLogout: () => void }) {
  const [open, setOpen] = React.useState(false)
  const { user } = useAuth()
  const firstName = user?.name?.trim().split(/\s+/)[0]
  const displayName = firstName || user?.email || 'Account'
  const initial = displayName.slice(0, 1).toUpperCase()

  React.useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [open])

  return <div className="relative" onClick={(event) => event.stopPropagation()}>
    <button title={user?.email} aria-label="Open account menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="grid h-10 w-10 place-items-center rounded-full bg-coral text-sm font-bold text-foreground ring-1 ring-coral/20 shadow-lift dark:text-white">{initial}</button>
    {open && <div className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-2xl border border-border bg-card p-2 shadow-2xl">
      <div className="border-b border-border px-3 py-2.5"><p className="truncate text-sm font-bold">{displayName}</p>{user?.email && user.email !== displayName && <p className="truncate text-xs text-muted-foreground">{user.email}</p>}</div>
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
  return <div className="min-h-[100dvh] bg-background text-foreground [overflow-x:hidden] [overflow-x:clip]">
    <PullToRefresh />
    <div className="pull-refresh-content">
      <div className="fixed inset-y-0 left-0 hidden md:block"><Sidebar /></div>
      <div className="md:pl-72">
        <header className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center justify-between relative border-b border-border/70 bg-background/85 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-xl md:h-20 md:px-8 md:pt-0">
          <div className="flex min-w-0 items-center gap-2 md:gap-3"><Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation menu" onClick={() => setMobileMenuOpen(true)}><Menu className="h-5 w-5" /></Button><div className="hidden min-w-0 md:block"><p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">{page.emoji} {page.pageLabel}</p><h1 className="truncate font-display text-2xl font-extrabold">{page.pageLabel}</h1></div></div><h1 className="pointer-events-none absolute left-1/2 -translate-x-1/2 font-display text-lg font-extrabold md:hidden">{page.pageLabel}</h1>
          <div className="flex items-center gap-1.5 md:gap-2"><Button size="sm" className="hidden md:inline-flex" onClick={() => setExpenseOpen(true)}><Plus className="h-4 w-4" />Add expense</Button><Button variant="ghost" size="icon" onClick={cycleTheme} aria-label="Toggle theme">{theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</Button><AccountMenu onLogout={logout} /></div>
        </header>
        <main className="relative p-4 pb-[calc(8rem+env(safe-area-inset-bottom))] md:p-8"><div className="soft-blob right-10 top-10 hidden h-56 w-56 bg-coral/20 md:block" /><ErrorBoundary resetKey={location.pathname}><Outlet context={{ openExpenseDialog: () => setExpenseOpen(true) }} /></ErrorBoundary></main>
      </div>
    </div>
    <MobileMenu open={mobileMenuOpen} onOpenChange={setMobileMenuOpen} />
    <BottomNav onAdd={() => setExpenseOpen(true)} />
    {expenseOpen && <ExpenseDialog open onOpenChange={setExpenseOpen} />}
  </div>
}
