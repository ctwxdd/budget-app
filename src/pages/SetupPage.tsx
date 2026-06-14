import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { SHEET_ID_KEY } from '../lib/defaults'
import { getSheetMeta } from '../lib/sheets'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from '../components/ui'
import { useToast } from '../components/ui/Toast'

function extractSheetId(value: string) {
  return value.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || value.trim()
}

export function SetupPage() {
  const [value, setValue] = React.useState(localStorage.getItem(SHEET_ID_KEY) || '')
  const [loading, setLoading] = React.useState(false)
  const navigate = useNavigate()
  const { toast } = useToast()
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
      toast({ title: 'Could not open spreadsheet', description: error instanceof Error ? error.message : String(error), variant: 'destructive' })
    } finally { setLoading(false) }
  }
  return <div className="relative grid min-h-screen place-items-center overflow-hidden bg-gradient-to-br from-background via-orange-50 to-rose-50 p-4 dark:from-background dark:via-background dark:to-card sm:p-6"><div className="soft-blob right-4 top-12 h-48 w-48 bg-peach/25 md:right-16 md:h-72 md:w-72" /><Card className="w-full max-w-xl bg-white/92 backdrop-blur dark:bg-card/90"><CardHeader className="text-center sm:text-left"><img src="/icon-192.png" alt="" className="mx-auto mb-3 h-16 w-16 rounded-3xl shadow-lift sm:mx-0" /><p className="text-sm font-bold uppercase tracking-[0.24em] text-coral">Chamomile Pocket</p><CardTitle className="text-3xl md:text-4xl">Connect your Google Sheet</CardTitle><CardDescription>Paste a Google Sheets URL or spreadsheet ID. The app reads/writes the Expense tab only.</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="space-y-4"><Input className="h-12" value={value} onChange={(event) => setValue(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." required /><Button className="h-12 w-full text-base" disabled={loading}>{loading ? 'Validating...' : 'Save and continue'}</Button></form><div className="mt-6 flex gap-3 rounded-3xl bg-accent/60 p-4 text-sm text-muted-foreground"><CheckCircle2 className="h-5 w-5 shrink-0 text-coral" /><p>Expected header: Date | Expense | Description | Category | Payment Method | Reimbursement</p></div></CardContent></Card></div>
}
