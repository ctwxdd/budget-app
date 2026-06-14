import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, UserCog } from 'lucide-react'
import { SHEET_ID_KEY } from '../lib/defaults'
import { getSheetMeta, SheetsHttpError } from '../lib/sheets'
import { useAuth } from '../lib/auth'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from '../components/ui'
import { useToast } from '../components/ui/Toast'
import { LoveNoteIcon } from '../components/LoveNoteIcon'

function extractSheetId(value: string) {
  return value.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || value.trim()
}

export function SetupPage() {
  const [value, setValue] = React.useState(localStorage.getItem(SHEET_ID_KEY) || '')
  const [loading, setLoading] = React.useState(false)
  const [switching, setSwitching] = React.useState(false)
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user, switchAccount } = useAuth()
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const id = extractSheetId(value)
    setLoading(true)
    try {
      const meta = await getSheetMeta(id)
      if (!meta.sheets.some((sheet) => sheet.title === 'Expense')) throw new Error('Spreadsheet must contain a tab named Expense.')
      localStorage.setItem(SHEET_ID_KEY, id)
      toast({ title: 'Spreadsheet connected' })
      navigate('/')
    } catch (error) {
      const isForbidden = error instanceof SheetsHttpError && error.status === 403
      const description = isForbidden && user?.email
        ? `${error.message} Signed in as ${user.email}.`
        : error instanceof Error ? error.message : String(error)
      toast({
        title: isForbidden ? "You don't have access to that sheet" : 'Could not open spreadsheet',
        description,
        variant: 'destructive',
        ...(isForbidden ? { action: { label: 'Switch account', onClick: () => { void onSwitch() } }, duration: 8000 } : {}),
      })
    } finally { setLoading(false) }
  }
  const onSwitch = async () => {
    setSwitching(true)
    try {
      await switchAccount()
    } catch {
      // user closed picker; ignore
    } finally { setSwitching(false) }
  }
  return <div className="relative grid min-h-screen place-items-center overflow-hidden bg-gradient-to-br from-background via-orange-50 to-rose-50 p-4 dark:from-background dark:via-background dark:to-card sm:p-6"><div className="soft-blob right-4 top-12 h-48 w-48 bg-peach/25 md:right-16 md:h-72 md:w-72" /><Card className="w-full max-w-xl bg-white/92 backdrop-blur dark:bg-card/90"><CardHeader className="text-center sm:text-left"><LoveNoteIcon className="mx-auto mb-3 sm:mx-0" imageClassName="h-16 w-16 rounded-3xl shadow-lift" /><p className="text-sm font-bold uppercase tracking-[0.24em] text-coral">Chamomile Pocket</p><CardTitle className="text-3xl md:text-4xl">Connect your Google Sheet</CardTitle><CardDescription>Paste a Google Sheets URL or spreadsheet ID. The app reads/writes the Expense tab only.</CardDescription></CardHeader><CardContent>
    {user?.email && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-accent/40 px-4 py-3 text-sm">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Signed in as</p>
        <p className="truncate font-semibold" title={user.email}>{user.email}</p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onSwitch} disabled={switching}><UserCog className="h-4 w-4" />{switching ? 'Switching…' : 'Use a different account'}</Button>
    </div>}
    <form onSubmit={submit} className="space-y-4"><Input className="h-12" value={value} onChange={(event) => setValue(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." required /><Button className="h-12 w-full text-base" disabled={loading}>{loading ? 'Validating...' : 'Save and continue'}</Button></form>
    <div className="mt-6 flex gap-3 rounded-3xl bg-accent/60 p-4 text-sm text-muted-foreground"><CheckCircle2 className="h-5 w-5 shrink-0 text-coral" /><p>Expected header: Date | Expense | Description | Category | Payment Method | Reimbursement</p></div>
  </CardContent></Card></div>
}
