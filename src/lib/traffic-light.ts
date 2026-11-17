import type { TrafficLight } from "@/lib/config";

/** The word shown beside the score, so the status is never carried by color alone. */
export const lightLabel: Record<TrafficLight, string> = {
  green: "Strong match",
  amber: "Possible match",
  red: "Weak match",
};
