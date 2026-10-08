import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '@/lib/utils'

/*
  Button vocabulary follows Supabase Studio: every variant carries a border, no
  variant carries a shadow, and the emphasised action is a deep brand-green tint
  with a green border and normal foreground text rather than a bright green
  plate. `default` stays the emphasised action so existing call sites keep their
  meaning; `surface` is the quieter neutral button Supabase uses as its own
  default.
*/
const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'border-brand-border bg-brand-tint text-foreground hover:border-brand hover:bg-brand-tint/80',
        surface:
          'border-input bg-card text-foreground hover:border-border-strong hover:bg-popover',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90',
        warning:
          'border-transparent bg-warning text-warning-foreground hover:bg-warning/90',
        outline:
          'border-input bg-transparent hover:bg-accent hover:text-accent-foreground',
        dashed:
          'border-dashed border-input bg-transparent hover:border-border-strong hover:bg-accent',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost:
          'border-transparent hover:bg-accent hover:text-accent-foreground',
        link: 'border-transparent text-brand underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-8 px-3 py-1',
        sm: 'h-7 rounded-md px-2.5 text-xs',
        lg: 'h-9 rounded-md px-4',
        icon: 'h-8 w-8'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
