"use client";

import { useSyncExternalStore } from "react";
import { formatJobDate, formatLocalJobDate } from "@/lib/jobs/helpers";

const subscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

/**
 * A date in the viewer's own time zone. The server (and the first client
 * render, so hydration matches) prints the UTC date; right after hydration it
 * switches to the local one.
 */
export function LocalDate({ iso }: { iso: string }) {
  const hydrated = useSyncExternalStore(subscribe, onClient, onServer);
  return (
    <time dateTime={iso}>{hydrated ? formatLocalJobDate(iso) : formatJobDate(iso)}</time>
  );
}
