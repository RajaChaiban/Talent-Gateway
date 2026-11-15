import { generateText } from "ai";
import { describe, expect, it } from "vitest";
import { AI_MODELS } from "@/lib/config";
import { fakeModelAllowed, resolveModel, standInAllowed } from "./model";

const reply = () => JSON.stringify({ ok: true });

describe("standInAllowed, the rule behind the stand-in flag", () => {
  const FLAGS = { E2E_FAKE_MODEL: "1" };
  const both = (env: Record<string, string>) => [
    standInAllowed(env),
    fakeModelAllowed({ ...FLAGS, ...env }),
  ];

  it.each([
    ["production", { VERCEL: "1", VERCEL_ENV: "production" }],
    ["production without VERCEL", { VERCEL_ENV: "production" }],
    ["preview", { VERCEL: "1", VERCEL_ENV: "preview" }],
    ["preview without VERCEL", { VERCEL_ENV: "preview" }],
    ["a Vercel build with no environment name", { VERCEL: "1" }],
    ["an unknown environment name", { VERCEL_ENV: "staging" }],
    ["an empty environment name", { VERCEL_ENV: "" }],
  ])("refuses the stand-in on %s", (_name, env) => {
    expect(both(env)).toEqual([false, false]);
  });

  it.each([
    ["development (vercel dev, or values written by vercel env pull)", { VERCEL: "1", VERCEL_ENV: "development" }],
    ["development without VERCEL", { VERCEL_ENV: "development" }],
    ["local, with no Vercel variables", {}],
  ])("allows the stand-in in %s", (_name, env) => {
    expect(both(env)).toEqual([true, true]);
  });
});

describe("fakeModelAllowed", () => {
  it("is off unless E2E_FAKE_MODEL is exactly 1", () => {
    expect(fakeModelAllowed({})).toBe(false);
    expect(fakeModelAllowed({ E2E_FAKE_MODEL: "true" })).toBe(false);
    expect(fakeModelAllowed({ E2E_FAKE_MODEL: "1" })).toBe(true);
  });

  it.each([
    [{ VERCEL_ENV: "production" }],
    [{ VERCEL: "1", VERCEL_ENV: "production" }],
    [{ VERCEL_ENV: "preview" }],
    [{ VERCEL: "1", VERCEL_ENV: "preview" }],
    [{ VERCEL: "1" }],
  ])("is never on for a Vercel deployment %j, whatever the flag says", (env) => {
    expect(fakeModelAllowed({ E2E_FAKE_MODEL: "1", ...env })).toBe(false);
  });

  it("stays on for a local test server even if `vercel env pull` wrote development values", () => {
    expect(fakeModelAllowed({ E2E_FAKE_MODEL: "1", VERCEL: "1", VERCEL_ENV: "development" })).toBe(true);
  });
});

describe("resolveModel", () => {
  it("passes the gateway slug through as a plain string by default, stand-in or not", async () => {
    await expect(resolveModel(AI_MODELS.scoring, undefined, {})).resolves.toBe(AI_MODELS.scoring);
    await expect(resolveModel(AI_MODELS.scoring, reply, {})).resolves.toBe(AI_MODELS.scoring);
  });

  it.each(["production", "preview"])(
    "on Vercel %s returns the real slug even with the test flag and a stand-in",
    async (vercelEnv) => {
      const model = await resolveModel(AI_MODELS.radar, reply, {
        E2E_FAKE_MODEL: "1",
        VERCEL: "1",
        VERCEL_ENV: vercelEnv,
      });
      expect(model).toBe(AI_MODELS.radar);
    },
  );

  it("fails closed: with the flag honoured and no stand-in it throws instead of calling the gateway", async () => {
    await expect(resolveModel(AI_MODELS.scoring, undefined, { E2E_FAKE_MODEL: "1" })).rejects.toThrow(
      "no stand-in reply",
    );
  });

  it("returns the stand-in, which answers with the reply for the user prompt", async () => {
    const seen: string[] = [];
    const model = await resolveModel(
      AI_MODELS.scoring,
      (prompt) => {
        seen.push(prompt);
        return "hello from the stand-in";
      },
      { E2E_FAKE_MODEL: "1" },
    );
    expect(model).toMatchObject({ provider: "test", modelId: AI_MODELS.scoring });
    const { text } = await generateText({ model, prompt: "the prompt" });
    expect(text).toBe("hello from the stand-in");
    expect(seen).toEqual(["the prompt"]);
  });

  it("uses gateway slugs in provider/model form", () => {
    for (const slug of Object.values(AI_MODELS)) expect(slug).toMatch(/^[a-z0-9-]+\/[a-z0-9.-]+$/);
  });
});
