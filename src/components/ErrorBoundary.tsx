import * as React from 'react'
import { Button, Card, CardContent, CardHeader, CardTitle } from './ui'

type Props = { children: React.ReactNode; resetKey?: string }
type State = { error: Error | null }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Page crashed', error, info)
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return <div className="min-h-[100dvh] px-4 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)] md:p-8">
      <Card className="mx-auto max-w-2xl border-coral/20 bg-white/95 shadow-soft dark:bg-card">
        <CardHeader>
          <CardTitle className="text-2xl">🐛 Something went wrong on this page</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <pre className="max-h-48 overflow-auto rounded-2xl bg-muted/70 p-4 font-mono text-sm text-muted-foreground whitespace-pre-wrap">{this.state.error.message}</pre>
          <div className="flex flex-wrap gap-3"><Button onClick={() => this.setState({ error: null })}>Try again</Button><Button variant="outline" onClick={() => { window.location.href = '/' }}>Go home</Button></div>
        </CardContent>
      </Card>
    </div>
  }
}

export function PageErrorBoundary({ children, resetKey }: Props) {
  return <ErrorBoundary resetKey={resetKey}>{children}</ErrorBoundary>
}
