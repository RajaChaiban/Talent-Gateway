import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/**
 * Shared by Input and Textarea so the two look identical side by side:
 * border, fill, focus ring, hover, invalid and disabled states.
 */
const fieldBase =
  "focus-ring w-full min-w-0 border border-input bg-background text-foreground transition-colors outline-none placeholder:text-muted-foreground hover:border-input-hover disabled:cursor-not-allowed disabled:border-border disabled:bg-disabled disabled:text-disabled-foreground aria-invalid:border-error aria-invalid:hover:border-error"

const inputVariants = cva(
  `${fieldBase} px-3 py-1 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground`,
  {
    variants: {
      size: {
        default: "h-9 rounded-md text-base md:text-sm",
        lg: "h-10 rounded-lg text-base",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

type InputProps = Omit<React.ComponentProps<"input">, "size"> &
  VariantProps<typeof inputVariants>

function Input({ className, type, size = "default", ...props }: InputProps) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      data-size={size}
      className={cn(inputVariants({ size }), className)}
      {...props}
    />
  )
}

export { Input, inputVariants, fieldBase }
