import type { TrafficLight } from "@/lib/config";

/** Background colour of the green / amber / red dot shown beside a score (status tokens in globals.css). */
export const lightClass: Record<TrafficLight, string> = {
  green: "bg-status-green",
  amber: "bg-status-amber",
  red: "bg-status-red",
};

/** The word shown beside the dot, so the status is never carried by color alone. */
export const lightLabel: Record<TrafficLight, string> = {
  green: "Strong match",
  amber: "Possible match",
  red: "Weak match",
};
