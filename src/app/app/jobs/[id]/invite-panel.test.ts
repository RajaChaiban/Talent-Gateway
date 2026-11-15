import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { invitationMessage } from "@/lib/invitations/message";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const { InvitePanelView, invitePhase, inviteShortcutLabel } = await import("./invite-panel");
type ViewProps = Parameters<typeof InvitePanelView>[0];

const NOW = new Date("2026-11-15T10:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const invitation = (over: Partial<{ sent_to: string; sent_at: string | null; approved_at: string }> = {}) => ({
  sent_to: "priya@example.com",
  sent_at: null,
  approved_at: ago(10_000),
  ...over,
});

function view(over: Partial<ViewProps>): string {
  return renderToStaticMarkup(
    createElement(InvitePanelView, {
      candidateId: "c1",
      candidateName: "Priya Natarajan",
      jobTitle: "Backend engineer",
      phase: "ready",
      email: "priya@example.com",
      sentTo: null,
      sentAt: null,
      error: null,
      onEmailChange: () => undefined,
      onSubmit: () => undefined,
      ...over,
    }),
  );
}

/** The disabled attribute (not the `disabled:` Tailwind variants in the class list). */
const DISABLED = /\sdisabled(?:=""|\s|>)/;
const button = (html: string) => html.match(/<button[^>]*>.*?<\/button>/)?.[0] ?? "";
const input = (html: string) => html.match(/<input[^>]*>/)?.[0] ?? "";

describe("invitePhase", () => {
  it("maps each stored status to its state", () => {
    expect(invitePhase({ invite_status: "NONE", invitation: null }, false, NOW)).toBe("ready");
    expect(
      invitePhase({ invite_status: "SENT", invitation: invitation({ sent_at: ago(0) }) }, false, NOW),
    ).toBe("sent");
    expect(invitePhase({ invite_status: "FAILED", invitation: invitation() }, false, NOW)).toBe("failed");
    expect(invitePhase({ invite_status: "APPROVED", invitation: invitation() }, false, NOW)).toBe("sending");
  });

  it("shows a stale APPROVED (2 minutes or older) as failed, so it can be retried", () => {
    const stale = invitation({ approved_at: ago(120_000) });
    expect(invitePhase({ invite_status: "APPROVED", invitation: stale }, false, NOW)).toBe("failed");
  });

  it("is sending while this page's request is in flight", () => {
    expect(invitePhase({ invite_status: "NONE", invitation: null }, true, NOW)).toBe("sending");
  });
});

describe("inviteShortcutLabel", () => {
  it("offers Invite to interview on a row with no invitation, or one still being sent", () => {
    expect(inviteShortcutLabel("NONE")).toBe("Invite to interview");
    expect(inviteShortcutLabel("APPROVED")).toBe("Invite to interview");
  });

  it("offers Try again after a failed send", () => {
    expect(inviteShortcutLabel("FAILED")).toBe("Try again");
  });

  it("offers no shortcut once the invitation was sent", () => {
    expect(inviteShortcutLabel("SENT")).toBeNull();
  });
});

describe("InvitePanelView", () => {
  it("NONE: a labelled email field prefilled from the resume and an enabled Invite button", () => {
    const html = view({});
    expect(html).toMatch(/<label[^>]*for="invite-email-c1"[^>]*>Candidate email<\/label>/);
    expect(input(html)).toContain('value="priya@example.com"');
    expect(input(html)).toContain('aria-describedby="invite-email-c1-hint"');
    expect(button(html)).toContain("Invite to interview");
    expect(button(html)).not.toMatch(DISABLED);
  });

  it.each([
    ["empty", ""],
    ["invalid", "priya@"],
  ])("acceptance 4: the button is disabled while the address is %s", (_, email) => {
    const html = view({ email });
    expect(button(html)).toMatch(DISABLED);
  });

  it("marks an invalid address as invalid, but not an empty field", () => {
    expect(input(view({ email: "priya@" }))).toContain('aria-invalid="true"');
    expect(input(view({ email: "" }))).not.toContain('aria-invalid="');
  });

  it("APPROVED / sending: Sending…, with the field and the button disabled, announced politely", () => {
    const html = view({ phase: "sending" });
    expect(button(html)).toContain("Sending…");
    expect(button(html)).toMatch(DISABLED);
    expect(input(html)).toMatch(DISABLED);
    expect(html).toMatch(/<p role="status" class="sr-only">Sending…<\/p>/);
  });

  it("FAILED: the error line, the field and Try again", () => {
    const html = view({ phase: "failed" });
    expect(html).toContain("The invitation could not be sent.");
    expect(input(html)).not.toMatch(DISABLED);
    expect(button(html)).toContain("Try again");
  });

  it("shows the last request's error as an alert", () => {
    const html = view({ phase: "failed", error: "The invitation could not be sent. Try again." });
    expect(html).toContain('role="alert"');
  });

  it("acceptance 9: SENT shows the address, the date and the email that was sent, and no button", () => {
    const html = view({ phase: "sent", sentTo: "priya@example.com", sentAt: "2026-11-15T10:00:00.000Z" });
    const message = invitationMessage("Priya Natarajan", "Backend engineer");
    expect(html).toContain("Invitation sent to <span");
    expect(html).toContain("priya@example.com");
    expect(html).toContain('<time dateTime="2026-11-15T10:00:00.000Z">Nov 15, 2026</time>');
    expect(html).toContain(message.subject);
    expect(html).toContain("Thank you for applying for the Backend engineer role.");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<input");
  });
});

type Node = { props?: { id?: string; ref?: unknown; children?: unknown } };

/** The element whose `id` is the email field's, found in the view's element tree without rendering it. */
function findField(node: unknown): Node | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findField(child);
      if (found) return found;
    }
    return null;
  }
  if (!node || typeof node !== "object") return null;
  const element = node as Node;
  if (element.props?.id === "invite-email-c1") return element;
  return findField(element.props?.children);
}

function fieldRef(over: Partial<ViewProps>): ((field: unknown) => void) | undefined {
  const tree = InvitePanelView({
    candidateId: "c1",
    candidateName: "Priya Natarajan",
    jobTitle: "Backend engineer",
    phase: "ready",
    email: "priya@example.com",
    sentTo: null,
    sentAt: null,
    error: null,
    onEmailChange: () => undefined,
    onSubmit: () => undefined,
    ...over,
  });
  return findField(tree)?.props?.ref as ((field: unknown) => void) | undefined;
}

describe("InvitePanelView focus request", () => {
  it("attaches no focus callback when nothing asked for focus", () => {
    expect(fieldRef({})).toBeUndefined();
  });

  it("scrolls the email field into view, focuses it, and reports it, without submitting", () => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    const onEmailFocused = vi.fn();
    const onSubmit = vi.fn();
    const field = { scrollIntoView: vi.fn(), focus: vi.fn() };

    const ref = fieldRef({ focusEmail: true, onEmailFocused, onSubmit });
    ref?.(field);

    expect(field.scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
    expect(field.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(onEmailFocused).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("does not animate the scroll for people who ask for less motion", () => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
    const field = { scrollIntoView: vi.fn(), focus: vi.fn() };
    fieldRef({ focusEmail: true })?.(field);
    expect(field.scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "auto" });
    vi.unstubAllGlobals();
  });

  it("ignores the detach call React makes with null", () => {
    const onEmailFocused = vi.fn();
    fieldRef({ focusEmail: true, onEmailFocused })?.(null);
    expect(onEmailFocused).not.toHaveBeenCalled();
  });
});
