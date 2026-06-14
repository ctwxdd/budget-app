import * as React from 'react'
import { Button } from './Button'
import { Dialog } from './Dialog'

type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void | Promise<void>
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = 'Confirm', cancelLabel = 'Cancel', destructive, onConfirm }: ConfirmDialogProps) {
  const [pending, setPending] = React.useState(false)
  const handle = async () => {
    setPending(true)
    try { await onConfirm(); onOpenChange(false) }
    finally { setPending(false) }
  }
  return <Dialog
    open={open}
    onOpenChange={(next) => { if (!pending) onOpenChange(next) }}
    title={title}
    description={description}
    mobileBottomSheet
    footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>{cancelLabel}</Button>
      <Button type="button" variant={destructive ? 'destructive' : 'default'} onClick={handle} disabled={pending}>{pending ? 'Working...' : confirmLabel}</Button>
    </div>}
  ><div className="text-sm text-muted-foreground">{description ? null : 'This action cannot be undone.'}</div></Dialog>
}
