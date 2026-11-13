import { describe, expect, it } from "vitest";
import { APP_TIME_ZONE } from "@/lib/datetime";

describe("display time zone", () => {
  it("is Swiss time", () => {
    expect(APP_TIME_ZONE).toBe("Europe/Zurich");
  });

  it("renders the same moment identically regardless of the runtime zone", () => {
    // 23:38 UTC on 13 Nov is 00:38 on 14 Nov in Zurich (CET, UTC+1).
    const iso = "2026-11-13T23:38:21Z";
    const text = new Date(iso).toLocaleString("en-CH", {
      timeZone: APP_TIME_ZONE,
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    expect(text).toContain("14");
    expect(text).toContain("00:38");
  });
});
