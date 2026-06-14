import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, FilePlus2, ShieldAlert, Sparkles, UserCog, X } from 'lucide-react'
import { DEFAULT_CATEGORIES, DEFAULT_PAYMENT_METHODS, REIMBURSEMENT_OPTIONS, SHEET_ID_KEY } from '../lib/defaults'
import { createSpreadsheet, getSheetMeta, SheetsHttpError } from '../lib/sheets'
import { forgetSheet, getRecentSheets, rememberSheet } from '../lib/recentSheets'
import { useAuth } from '../lib/auth'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from '../components/ui'
import { useToast } from '../components/ui/Toast'
import { LoveNoteIcon } from '../components/LoveNoteIcon'

function extractSheetId(value: string) {
  return value.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || value.trim()
}

function defaultNewSheetTitle() {
  const date = new Date()
  return `Chamomile Pocket — ${date.getFullYear()}`
}

export function SetupPage() {
  const [value, setValue] = React.useState(localStorage.getItem(SHEET_ID_KEY) || '')
  const [loading, setLoading] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const [switching, setSwitching] = React.useState(false)
  const [reauthing, setReauthing] = React.useState(false)
  const [recents, setRecents] = React.useState(() => getRecentSheets())
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user, hasSheetsScope, switchAccount, reauthorize } = useAuth()

  // Seed the recent-sheets list with the currently-connected sheet on first load.
  React.useEffect(() => {
    const currentId = localStorage.getItem(SHEET_ID_KEY) || ''
    if (!currentId || !hasSheetsScope) return
    if (recents.some((entry) => entry.id === currentId)) return
    let cancelled = false
    getSheetMeta(currentId).then((meta) => {
      if (cancelled) return
      rememberSheet(currentId, meta.title || 'Untitled spreadsheet')
      setRecents(getRecentSheets())
    }).catch(() => { /* ignore — user can still paste a URL */ })
    return () => { cancelled = true }
  }, [hasSheetsScope, recents])

  const connect = React.useCallback(async (id: string) => {
    const meta = await getSheetMeta(id)
    if (!meta.sheets.some((sheet) => sheet.title === 'Expense')) throw new Error('Spreadsheet must contain a tab named Expense.')
    localStorage.setItem(SHEET_ID_KEY, id)
    rememberSheet(id, meta.title || 'Untitled spreadsheet')
    setRecents(getRecentSheets())
  }, [])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!hasSheetsScope) {
      toast({ title: 'Spreadsheet permission missing', description: "You didn't grant access to your spreadsheets on the Google consent screen. Tap Grant permission below.", variant: 'destructive', duration: 7000 })
      return
    }
    const id = extractSheetId(value)
    setLoading(true)
    try {
      await connect(id)
      toast({ title: 'Spreadsheet connected' })
      navigate('/')
    } catch (error) {
      const isForbidden = error instanceof SheetsHttpError && error.status === 403
      const description = isForbidden && user?.email
        ? `${(error as Error).message} Signed in as ${user.email}.`
        : error instanceof Error ? error.message : String(error)
      toast({
        title: isForbidden ? "You don't have access to that sheet" : 'Could not open spreadsheet',
        description,
        variant: 'destructive',
        ...(isForbidden ? { action: { label: 'Switch account', onClick: () => { void onSwitch() } }, duration: 8000 } : {}),
      })
    } finally { setLoading(false) }
  }

  const createNew = async () => {
    if (!hasSheetsScope) {
      toast({ title: 'Spreadsheet permission missing', description: 'Grant the Sheets permission below first.', variant: 'destructive' })
      return
    }
    setCreating(true)
    try {
      const created = await createSpreadsheet({
        title: defaultNewSheetTitle(),
        categories: DEFAULT_CATEGORIES,
        paymentMethods: DEFAULT_PAYMENT_METHODS,
        reimbursements: REIMBURSEMENT_OPTIONS,
      })
      localStorage.setItem(SHEET_ID_KEY, created.spreadsheetId)
      rememberSheet(created.spreadsheetId, created.title)
      setRecents(getRecentSheets())
      toast({ title: 'New sheet ready', description: `${created.title} created with Expense, Cards, and Giftcard tabs.` })
      navigate('/')
    } catch (error) {
      toast({ title: 'Could not create spreadsheet', description: error instanceof Error ? error.message : String(error), variant: 'destructive' })
    } finally { setCreating(false) }
  }

  const switchTo = async (id: string) => {
    setLoading(true)
    try {
      await connect(id)
      toast({ title: 'Spreadsheet connected' })
      navigate('/')
    } catch (error) {
      toast({ title: 'Could not open spreadsheet', description: error instanceof Error ? error.message : String(error), variant: 'destructive' })
    } finally { setLoading(false) }
  }

  const remove = (id: string, title: string) => {
    forgetSheet(id)
    setRecents(getRecentSheets())
    toast({ title: 'Removed from this device', description: `${title || 'Spreadsheet'} is still in your Google Drive — only the shortcut here was cleared.` })
  }

  const onSwitch = async () => {
    setSwitching(true)
    try {
      await switchAccount()
    } catch (error) {
      if (error instanceof Error && error.message === 'SHEETS_SCOPE_MISSING') {
        toast({ title: 'Spreadsheet permission missing', description: 'On the Google consent screen, leave "See, edit, create, and delete all your Google Sheets spreadsheets" turned on.', variant: 'destructive', action: { label: 'Try again', onClick: () => { void onReauth() } }, duration: 8000 })
      }
    } finally { setSwitching(false) }
  }
  const onReauth = async () => {
    setReauthing(true)
    try {
      await reauthorize()
      toast({ title: 'Permissions updated' })
    } catch (error) {
      if (error instanceof Error && error.message === 'SHEETS_SCOPE_MISSING') {
        toast({ title: 'Still missing Sheets permission', description: 'Please leave the Google Sheets permission checked on the consent screen.', variant: 'destructive' })
      }
    } finally { setReauthing(false) }
  }
  const currentId = localStorage.getItem(SHEET_ID_KEY) || ''
  return <div className="relative grid min-h-screen place-items-center overflow-hidden bg-gradient-to-br from-background via-orange-50 to-rose-50 p-4 dark:from-background dark:via-background dark:to-card sm:p-6"><div className="soft-blob right-4 top-12 h-48 w-48 bg-peach/25 md:right-16 md:h-72 md:w-72" /><Card className="w-full max-w-xl bg-white/92 backdrop-blur dark:bg-card/90"><CardHeader className="text-center sm:text-left"><LoveNoteIcon className="mx-auto mb-3 sm:mx-0" imageClassName="h-16 w-16 rounded-3xl shadow-lift" /><p className="text-sm font-bold uppercase tracking-[0.24em] text-coral">Chamomile Pocket</p><CardTitle className="text-3xl md:text-4xl">Connect your Google Sheet</CardTitle><CardDescription>Start fresh with a one-click template, pick a recent sheet, or paste a URL.</CardDescription></CardHeader><CardContent>
    {user?.email && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-accent/40 px-4 py-3 text-sm">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Signed in as</p>
        <p className="truncate font-semibold" title={user.email}>{user.email}</p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onSwitch} disabled={switching}><UserCog className="h-4 w-4" />{switching ? 'Switching…' : 'Use a different account'}</Button>
    </div>}
    {!hasSheetsScope && <div className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <div className="flex min-w-0 items-start gap-2"><ShieldAlert className="h-5 w-5 shrink-0" /><div className="min-w-0"><p className="font-semibold">Google Sheets permission not granted</p><p className="text-destructive/80">On the Google consent screen, keep the checkbox for "See, edit, create, and delete all your Google Sheets spreadsheets" turned on.</p></div></div>
      <Button type="button" variant="destructive" size="sm" onClick={onReauth} disabled={reauthing}>{reauthing ? 'Opening…' : 'Grant permission'}</Button>
    </div>}
    <div className="mb-5 space-y-3">
      <Button type="button" variant="gradient" className="h-12 w-full text-base" onClick={createNew} disabled={creating || !hasSheetsScope}><Sparkles className="h-5 w-5" />{creating ? 'Creating new sheet…' : 'Create a new sheet for me'}</Button>
      <p className="px-1 text-xs text-muted-foreground">Builds <strong>Expense</strong>, <strong>Cards</strong>, and <strong>Giftcard</strong> tabs with headers, date/currency formats, dropdowns for category and payment method, and a protected header row so accidental edits don't break the app.</p>
    </div>
    {recents.length > 0 && <div className="mb-5">
      <p className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent sheets</p>
      <p className="mb-2 px-1 text-[11px] text-muted-foreground/80">Saved on this device only. Removing one here doesn't touch the actual Google Sheet.</p>
      <ul className="space-y-2">
        {recents.map((entry) => {
          const isCurrent = entry.id === currentId
          return <li key={entry.id} className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition ${isCurrent ? 'border-coral/40 bg-coral/10' : 'border-border bg-card hover:bg-accent/40'}`}>
            <button type="button" onClick={() => switchTo(entry.id)} disabled={loading || isCurrent} className="flex min-w-0 flex-1 items-center gap-2 text-left">
              <FilePlus2 className={`h-4 w-4 shrink-0 ${isCurrent ? 'text-coral' : 'text-muted-foreground'}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{entry.title || 'Untitled spreadsheet'}</span>
                {isCurrent && <span className="text-[10px] font-bold uppercase tracking-wide text-coral">Connected</span>}
              </span>
            </button>
            <button type="button" onClick={() => remove(entry.id, entry.title)} aria-label={`Remove ${entry.title} from this device`} title="Remove from recents (does not delete the Google Sheet)" className="rounded-full p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"><X className="h-4 w-4" /></button>
          </li>
        })}
      </ul>
    </div>}
    <form onSubmit={submit} className="space-y-3"><label className="block space-y-1"><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Or paste an existing sheet URL</span><Input className="h-12" value={value} onChange={(event) => setValue(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." /></label><Button className="h-12 w-full text-base" disabled={loading || !hasSheetsScope || !value.trim()}>{loading ? 'Validating…' : 'Connect this sheet'}</Button></form>
    <div className="mt-6 flex gap-3 rounded-3xl bg-accent/60 p-4 text-sm text-muted-foreground"><CheckCircle2 className="h-5 w-5 shrink-0 text-coral" /><p>Expected header: Date | Expense | Description | Category | Payment Method | Reimbursement</p></div>
  </CardContent></Card></div>
}
