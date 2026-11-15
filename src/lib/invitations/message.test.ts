import { describe, expect, it } from "vitest";
import { invitationMessage } from "./message";

describe("invitationMessage", () => {
  const message = invitationMessage("Priya Natarajan", "Backend engineer");

  it("puts the job title in the subject", () => {
    expect(message.subject).toBe("Interview invitation: Backend engineer");
  });

  it("greets the candidate, names the job, says a recruiter wants to interview and will follow up", () => {
    expect(message.text).toMatch(/^Hello Priya Natarajan,/);
    expect(message.text).toContain("Backend engineer");
    expect(message.text).toContain(
      "A recruiter has reviewed your application and would like to invite you to an interview.",
    );
    expect(message.text).toContain("will follow up with you shortly to arrange a time");
  });

  it("carries no score, ranking or link", () => {
    expect(message.text).not.toMatch(/\d/);
    expect(message.text).not.toMatch(/score|rank|https?:|www\./i);
  });

  it("is pure: the same input always gives the same message", () => {
    expect(invitationMessage("Priya Natarajan", "Backend engineer")).toEqual(message);
  });

  it("trims the inputs and falls back to a plain greeting without a name", () => {
    const bare = invitationMessage("  ", " Designer ");
    expect(bare.subject).toBe("Interview invitation: Designer");
    expect(bare.text).toMatch(/^Hello,\n/);
  });
});
