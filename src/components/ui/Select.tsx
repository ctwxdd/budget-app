import * as React from 'react'
import { cn } from '../../lib/utils'

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => <select ref={ref} className={cn('block h-11 min-w-0 w-full appearance-none rounded-full border border-input bg-white/80 bg-[length:1rem] bg-[right_1rem_center] bg-no-repeat py-2 pl-4 pr-10 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-card sm:text-sm', className)} style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%237C7689' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 8 10 12 14 8'/></svg>\")" }} {...props}>{children}</select>)
Select.displayName = 'Select'
