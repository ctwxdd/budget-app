import * as React from 'react'
import { Heart, Sparkles } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { Button, Dialog } from './ui'
import { cn } from '../lib/utils'

const REQUIRED_TAPS = 5
const TAP_RESET_MS = 1600

export function LoveNoteIcon({ className, imageClassName, alt = 'Pocket Ledger' }: { className?: string; imageClassName?: string; alt?: string }) {
  const { user } = useAuth()
  const [open, setOpen] = React.useState(false)
  const taps = React.useRef(0)
  const resetTimer = React.useRef<number | null>(null)
  const firstName = user?.name?.trim().split(/\s+/)[0]

  React.useEffect(() => () => {
    if (resetTimer.current) window.clearTimeout(resetTimer.current)
  }, [])

  const reveal = () => {
    taps.current += 1
    if (resetTimer.current) window.clearTimeout(resetTimer.current)
    if (taps.current >= REQUIRED_TAPS) {
      taps.current = 0
      setOpen(true)
      return
    }
    resetTimer.current = window.setTimeout(() => { taps.current = 0 }, TAP_RESET_MS)
  }

  return <>
    <button type="button" aria-label={alt} onClick={reveal} className={cn('shrink-0 rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral', className)}>
      <img src="/icon-192.png" alt="" draggable={false} className={cn('select-none', imageClassName)} />
    </button>
    <Dialog open={open} onOpenChange={setOpen} title={firstName ? `For you, ${firstName}` : 'A little note for you'} mobileBottomSheet className="md:max-w-md">
      <div className="pb-2 text-center">
        <div className="relative mx-auto mb-5 grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-butter/50 via-peach/40 to-coral/20 shadow-lift">
          <img src="/icon-192.png" alt="" className="h-20 w-20 rounded-[1.6rem]" />
          <Sparkles className="absolute -right-2 top-0 h-6 w-6 text-coral" />
          <Heart className="absolute -bottom-1 -left-2 h-6 w-6 fill-coral text-coral" />
        </div>
        <p className="font-display text-xl font-bold text-foreground">This little pocket was made with love, just for you.</p>
        <p className="mx-auto mt-3 max-w-sm leading-relaxed text-muted-foreground">May it make money feel lighter and leave more room for the things that make you smile.</p>
        <p className="mt-5 font-semibold text-coral">Always on your team. 🌼</p>
        <Button type="button" variant="gradient" className="mt-6 w-full" onClick={() => setOpen(false)}>Keep this little secret</Button>
      </div>
    </Dialog>
  </>
}
