import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { fieldBase } from "@/components/ui/input"
import { cn } from "@/lib/utils"

const textareaVariants = cva(`${fieldBase} flex field-sizing-content min-h-16`, {
  variants: {
    size: {
      default: "rounded-md px-3 py-2 text-base md:text-sm",
      lg: "rounded-lg px-3 py-2.5 text-base",
    },
  },
  defaultVariants: {
    size: "default",
  },
})

type TextareaProps = React.ComponentProps<"textarea"> &
  VariantProps<typeof textareaVariants>

function Textarea({ className, size = "default", ...props }: TextareaProps) {
  return (
    <textarea
      data-slot="textarea"
      data-size={size}
      className={cn(textareaVariants({ size }), className)}
      {...props}
    />
  )
}

export { Textarea }
