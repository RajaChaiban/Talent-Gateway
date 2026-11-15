"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Long text is clamped; "Show more" appears only when the clamp actually hides something. */
export function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const paragraph = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const element = paragraph.current;
    if (!element) return;
    const measure = () => {
      if (!expanded) setOverflowing(element.scrollHeight > element.clientHeight + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, expanded]);

  return (
    <div className="flex flex-col items-start gap-3">
      <p
        ref={paragraph}
        id="job-description"
        className={cn(
          "w-full max-w-prose whitespace-pre-wrap break-words text-copy-14 text-foreground",
          !expanded && "line-clamp-8",
        )}
      >
        {text}
      </p>
      {expanded || overflowing ? (
        <Button
          variant="outline"
          size="sm"
          aria-expanded={expanded}
          aria-controls="job-description"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show less" : "Show more"}
        </Button>
      ) : null}
    </div>
  );
}
