import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { sendInvitationEmail } from "./send";

const SRC = join(__dirname, "..", "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("sendInvitationEmail (acceptance 10: no test sends real email)", () => {
  it("is the stand-in outbox: returns outbox:<invitation id> and delivers nothing", async () => {
    await expect(
      sendInvitationEmail({
        to: "priya@example.com",
        subject: "Interview invitation: Backend engineer",
        text: "Hello",
        idempotencyKey: "inv-1",
      }),
    ).resolves.toBe("outbox:inv-1");
  });

  it("imports nothing and calls no network", () => {
    const text = readFileSync(join(__dirname, "send.ts"), "utf8");
    expect(text).not.toMatch(/\bimport\b/);
    expect(text).not.toMatch(/\bfetch\s*\(/);
  });

  it("is imported by the invite orchestration only, so it is the one place a provider could be called", () => {
    const importers = sourceFiles(SRC)
      .filter((path) => /from\s*["'][^"']*invitations\/send["']|from\s*["']\.\/send["']/.test(readFileSync(path, "utf8")))
      .map((path) => relative(SRC, path).split(sep).join("/"));
    expect(importers).toEqual(["lib/invitations/invite.ts"]);
  });
});
