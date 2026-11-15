import type { TrafficLight } from "@/lib/config";

/** Background colour of the green / amber / red dot shown beside a score (status tokens in globals.css). */
export const lightClass: Record<TrafficLight, string> = {
  green: "bg-status-green",
  amber: "bg-status-amber",
  red: "bg-status-red",
};
