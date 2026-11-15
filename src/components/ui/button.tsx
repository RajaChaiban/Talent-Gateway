import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/** Filled and bordered variants share one disabled look; borderless ones only grey their label. */
const disabledFilled =
  "disabled:border-border disabled:bg-disabled disabled:text-disabled-foreground"
const disabledBare = "disabled:bg-transparent disabled:text-disabled-foreground"

const buttonStyles = cva(
  "group/button focus-ring inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent bg-clip-padding font-medium whitespace-nowrap transition-colors outline-none select-none disabled:cursor-not-allowed aria-invalid:border-error [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: `bg-primary text-primary-foreground hover:bg-primary-hover ${disabledFilled}`,
        outline: `border-border bg-background text-secondary-foreground hover:bg-secondary active:bg-secondary-hover aria-expanded:bg-secondary-hover ${disabledFilled}`,
        secondary: `bg-secondary text-secondary-foreground hover:bg-secondary-hover active:bg-secondary-active aria-expanded:bg-secondary-active ${disabledFilled}`,
        ghost: `text-secondary-foreground hover:bg-secondary active:bg-secondary-hover aria-expanded:bg-secondary-hover ${disabledBare}`,
        destructive: `bg-destructive text-destructive-foreground hover:bg-destructive-hover ${disabledFilled}`,
        link: `h-auto! border-0 px-0! text-link underline-offset-4 hover:underline ${disabledBare}`,
      },
      size: {
        default:
          "h-9 gap-1.5 px-3 text-button-14 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-6 gap-1 rounded-sm px-2 text-button-12 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-2.5 text-button-14 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-2 rounded-lg px-4 text-button-14 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-9",
        "icon-xs": "size-6 rounded-sm [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/**
 * Class names for a button-styled element. Merged with tailwind-merge so a
 * variant (e.g. outline's border-border) overrides the base (border-transparent)
 * even on a Link that uses these classes without the Button component.
 */
function buttonVariants(options?: Parameters<typeof buttonStyles>[0]) {
  return cn(buttonStyles(options))
}

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonStyles>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={buttonVariants({ variant, size, className })}
      {...props}
    />
  )
}

export { Button, buttonVariants }
