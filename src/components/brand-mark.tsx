import { cn } from '@/lib/utils'

// Kigumi's mark: two interlocking timber joints, drawn in the brand tint.
export function BrandMark({ className }: { readonly className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-brand-border bg-brand-tint text-brand',
        className
      )}
    >
      <svg viewBox='0 0 16 16' className='h-4 w-4' fill='currentColor'>
        <path d='M2 3h7v3H5v4H2z' />
        <path d='M14 13H7v-3h4V6h3z' opacity='0.7' />
      </svg>
    </span>
  )
}
