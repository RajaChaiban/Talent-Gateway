const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

const LOCAL_DATE_FORMAT = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

function formatWith(format: Intl.DateTimeFormat, iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : format.format(date);
}

/** Fixed locale and zone, so server and browser print the same initial text. */
export function formatJobDate(iso: string): string {
  return formatWith(DATE_FORMAT, iso);
}

/** The same date in the viewer's local time zone. */
export function formatLocalJobDate(iso: string): string {
  return formatWith(LOCAL_DATE_FORMAT, iso);
}

export function resumeCountLabel(count: number): string {
  return count === 1 ? "1 resume" : `${count} resumes`;
}
