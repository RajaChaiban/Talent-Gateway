import { z } from "zod";
import { isScore, SCORE_SCALE_MESSAGE, toStored } from "@/lib/score";

/** A request field on the 0 to 10 scale. It parses to stored tenths, so everything after the schema sees `StoredScore`. */
export function scoreField(label: string) {
  const message = `${label} ${SCORE_SCALE_MESSAGE}`;
  return z
    .number({ error: message })
    .refine(isScore, { error: message })
    .transform(toStored);
}
