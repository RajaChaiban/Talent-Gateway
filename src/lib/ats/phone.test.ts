import { describe, expect, it } from "vitest";
import { findPhoneNumbers, PHONE_MIN_DIGITS, replacePhoneNumbers } from "./phone";

describe("findPhoneNumbers", () => {
  it.each([
    ["+1 555 010 0177", "15550100177"],
    ["(555) 010-0142", "5550100142"],
    ["+49 30 5550 0142", "493055500142"],
    ["Call 555.010.0142 today", "5550100142"],
    ["tab\t+44\t20 7946 0000", "442079460000"],
  ])("finds %j", (text, digits) => {
    expect(findPhoneNumbers(text)).toEqual([digits]);
  });

  it("needs at least nine digits, so a date range is not a phone number", () => {
    expect(PHONE_MIN_DIGITS).toBe(9);
    expect(findPhoneNumbers("2015 - 2019")).toEqual([]);
    expect(findPhoneNumbers("555 0142")).toEqual([]);
    expect(findPhoneNumbers("555 010 014")).toEqual(["555010014"]);
  });

  it.each(["\n", "\r\n", "\r", "\f", "\v"])("never joins date ranges across a %j break", (lineBreak) => {
    const stacked = ["2019 - 2022", "2017 - 2019", "2015 - 2017"].join(lineBreak);
    expect(findPhoneNumbers(stacked)).toEqual([]);
  });

  it("never joins across Unicode line and paragraph separators", () => {
    for (const separator of [0x85, 0x2028, 0x2029].map((code) => String.fromCharCode(code))) {
      expect(findPhoneNumbers(`2019 - 2022${separator}2017 - 2019`)).toEqual([]);
    }
  });

  it("finds each number on its own line", () => {
    expect(findPhoneNumbers("+1 555 010 0177\n(555) 010-0142")).toEqual(["15550100177", "5550100142"]);
  });
});

describe("replacePhoneNumbers", () => {
  it("replaces phone numbers and leaves date ranges alone", () => {
    expect(replacePhoneNumbers("At Acme (2015 - 2019). Call (555) 010-0142.", "[phone]")).toBe(
      "At Acme (2015 - 2019). Call [phone].",
    );
  });

  it("leaves stacked date ranges alone", () => {
    expect(replacePhoneNumbers("2019 - 2022\n2017 - 2019", "[phone]")).toBe("2019 - 2022\n2017 - 2019");
  });
});
