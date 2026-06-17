import { AlertTriangle, RefreshCw } from 'lucide-react'
import { isRateLimitError } from '../../lib/sheets'
import { Button, Card, CardContent, CardHeader, CardTitle } from '../ui'

export function QueryError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const rateLimited = isRateLimitError(error)
  return <div className="min-h-[40dvh] px-0 pb-4 pt-[env(safe-area-inset-top)] md:pt-0">
    <Card className="mx-auto max-w-2xl border-coral/20 bg-white/95 dark:bg-card">
      <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-coral" />{rateLimited ? 'Google Sheets is busy' : 'Could not load your budget'}</CardTitle></CardHeader>
      <CardContent className="space-y-4"><p className="text-sm text-muted-foreground">{error.message}</p><Button onClick={onRetry}><RefreshCw className="h-4 w-4" />Try again</Button></CardContent>
    </Card>
  </div>
}
