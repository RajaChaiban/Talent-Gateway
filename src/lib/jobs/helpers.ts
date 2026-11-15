const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

const LOCAL_DATE_FORMAT = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

function formatWith(format: Intl.DateTimeFormat, iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : format.format(date);
}

/** Fixed locale and zone, so the server and the browser print the same text. */
export function formatJobDate(iso: string): string {
  return formatWith(DATE_FORMAT, iso);
}

/** The same date in the time zone of the machine it runs on (the viewer's browser). */
export function formatLocalJobDate(iso: string): string {
  return formatWith(LOCAL_DATE_FORMAT, iso);
}

export function resumeCountLabel(count: number): string {
  return count === 1 ? "1 resume" : `${count} resumes`;
}
