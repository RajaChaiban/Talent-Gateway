"use client"

import { useRef, type FocusEventHandler, type ReactNode } from "react"
import { Slider as SliderPrimitive } from "@base-ui/react/slider"
import { cn } from "@/lib/utils"

type SliderProps = SliderPrimitive.Root.Props & {
  /** Accessible name; also shown above the track with the live value. */
  label?: ReactNode
  onThumbBlur?: FocusEventHandler<HTMLInputElement>
}

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  label,
  onThumbBlur,
  ...props
}: SliderProps) {
  const firstThumb = useRef<HTMLInputElement>(null)
  const thumbCount = Array.isArray(value)
    ? value.length
    : typeof value === "number"
      ? 1
      : Array.isArray(defaultValue)
        ? defaultValue.length
        : typeof defaultValue === "number"
          ? 1
          : 2

  return (
    <SliderPrimitive.Root
      className={cn("flex flex-col gap-3 data-horizontal:w-full data-vertical:h-full", className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      {label ? (
        <div className="flex items-baseline justify-between gap-4">
          <SliderPrimitive.Label
            className="text-label-14 font-medium text-foreground"
            onClick={() => firstThumb.current?.focus()}
          >{label}</SliderPrimitive.Label>
          <SliderPrimitive.Value className="font-mono text-label-16 font-semibold tabular-nums" />
        </div>
      ) : null}
      <SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative grow overflow-hidden rounded-full bg-slider-track select-none data-disabled:bg-border data-horizontal:h-1 data-horizontal:w-full data-vertical:h-full data-vertical:w-1"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="bg-slider-range select-none data-disabled:bg-disabled-foreground data-horizontal:h-full data-vertical:w-full"
          />
        </SliderPrimitive.Track>
        {Array.from({ length: thumbCount }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            index={index}
            inputRef={index === 0 ? firstThumb : undefined}
            onBlur={onThumbBlur}
            className="relative block size-4 shrink-0 cursor-grab rounded-full border border-slider-thumb-border bg-slider-thumb transition-transform select-none after:absolute after:-inset-2 hover:scale-110 active:cursor-grabbing has-focus-visible:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--ring)] data-disabled:cursor-not-allowed data-disabled:border-disabled-foreground data-disabled:bg-disabled data-disabled:hover:scale-100"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
