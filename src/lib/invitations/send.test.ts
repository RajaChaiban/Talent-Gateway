import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { sendInvitationEmail } from "./send";

const SRC = join(__dirname, "..", "..");

const email = {
  to: "priya@example.com",
  subject: "Interview invitation: Backend engineer",
  text: "Hello",
  idempotencyKey: "inv-1",
};

const WITH_KEY = { RESEND_API_KEY: "re_test_key", INVITE_FROM_EMAIL: "Hiring <hiring@example.com>" };

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** A stand-in for `fetch` that records the request and answers with `status` and `body`. */
function fetcherAnswering(status: number, body: unknown) {
  return vi.fn<typeof fetch>(async () => Response.json(body, { status }));
}

function sentRequest(fetcher: ReturnType<typeof fetcherAnswering>) {
  const [url, init] = fetcher.mock.calls[0];
  const headers = new Headers(init?.headers);
  return { url, method: init?.method, headers, body: JSON.parse(String(init?.body)) as Record<string, unknown> };
}

describe("sendInvitationEmail without a provider key (acceptance 10: no test sends real email)", () => {
  it("is the stand-in outbox: returns outbox:<invitation id> and calls no network", async () => {
    const fetcher = fetcherAnswering(200, { id: "never" });
    await expect(sendInvitationEmail(email, {}, fetcher)).resolves.toBe("outbox:inv-1");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("treats an empty key as no key", async () => {
    const fetcher = fetcherAnswering(200, { id: "never" });
    await expect(sendInvitationEmail(email, { RESEND_API_KEY: "" }, fetcher)).resolves.toBe("outbox:inv-1");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses the outbox in this test run, where no provider key is set", async () => {
    expect(process.env.RESEND_API_KEY).toBeUndefined();
    await expect(sendInvitationEmail(email)).resolves.toBe("outbox:inv-1");
  });
});

describe("sendInvitationEmail with a provider key", () => {
  it("posts the email to Resend once and returns the provider's message id", async () => {
    const fetcher = fetcherAnswering(200, { id: "msg_123" });

    await expect(sendInvitationEmail(email, WITH_KEY, fetcher)).resolves.toBe("msg_123");

    expect(fetcher).toHaveBeenCalledTimes(1);
    const request = sentRequest(fetcher);
    expect(request.url).toBe("https://api.resend.com/emails");
    expect(request.method).toBe("POST");
    expect(request.headers.get("authorization")).toBe("Bearer re_test_key");
    expect(request.body).toEqual({
      from: "Hiring <hiring@example.com>",
      to: ["priya@example.com"],
      subject: "Interview invitation: Backend engineer",
      text: "Hello",
    });
  });

  it("sends the invitation id as the idempotency key, so a repeated request is delivered once", async () => {
    const fetcher = fetcherAnswering(200, { id: "msg_123" });
    await sendInvitationEmail(email, WITH_KEY, fetcher);
    expect(sentRequest(fetcher).headers.get("idempotency-key")).toBe("inv-1");
  });

  it("with INVITE_REDIRECT_TO, delivers to that inbox and names the approved address in the subject", async () => {
    const fetcher = fetcherAnswering(200, { id: "msg_123" });

    await sendInvitationEmail(email, { ...WITH_KEY, INVITE_REDIRECT_TO: "demo-inbox@example.com" }, fetcher);

    const { body } = sentRequest(fetcher);
    expect(body.to).toEqual(["demo-inbox@example.com"]);
    expect(body.subject).toBe("[to: priya@example.com] Interview invitation: Backend engineer");
  });

  it("throws when there is no from address, before calling the provider", async () => {
    const fetcher = fetcherAnswering(200, { id: "msg_123" });
    await expect(sendInvitationEmail(email, { RESEND_API_KEY: "re_test_key" }, fetcher)).rejects.toThrow(
      "INVITE_FROM_EMAIL is not set",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("throws with the provider's status and reason when it refuses, and never includes the key", async () => {
    const fetcher = fetcherAnswering(403, {
      name: "validation_error",
      message: "You can only send testing emails to your own email address",
    });

    const error = await sendInvitationEmail(email, WITH_KEY, fetcher).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    const { message } = error as Error;
    expect(message).toContain("status 403");
    expect(message).toContain("You can only send testing emails to your own email address");
    expect(message).not.toContain("re_test_key");
  });

  it("throws when the provider answers 200 without a message id", async () => {
    const fetcher = fetcherAnswering(200, {});
    await expect(sendInvitationEmail(email, WITH_KEY, fetcher)).rejects.toThrow("did not accept the invitation");
  });

  it("throws when the provider's answer is not JSON", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("bad gateway", { status: 502 }));
    await expect(sendInvitationEmail(email, WITH_KEY, fetcher)).rejects.toThrow("status 502");
  });
});

describe("where delivery happens", () => {
  it("is imported by the invite orchestration only, so it is the one place a provider is called", () => {
    const importers = sourceFiles(SRC)
      .filter((path) => /from\s*["'][^"']*invitations\/send["']|from\s*["']\.\/send["']/.test(readFileSync(path, "utf8")))
      .map((path) => relative(SRC, path).split(sep).join("/"));
    expect(importers).toEqual(["lib/invitations/invite.ts"]);
  });

  it("no other source file calls the Resend API", () => {
    const callers = sourceFiles(SRC)
      .filter((path) => readFileSync(path, "utf8").includes("api.resend.com"))
      .map((path) => relative(SRC, path).split(sep).join("/"));
    expect(callers).toEqual(["lib/invitations/send.ts"]);
  });
});
