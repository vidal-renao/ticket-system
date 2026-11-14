import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { THEME_BOOT_SCRIPT } from "@/lib/theme-boot-script";
import { DAY_START_HOUR, NIGHT_START_HOUR, resolveAutoTheme } from "@/lib/theme-schedule";

function at(hour: number, minute = 0): Date {
  return new Date(2026, 10, 14, hour, minute, 0);
}

describe("resolveAutoTheme", () => {
  it("uses 07:00 and 19:00 as the boundaries", () => {
    expect(DAY_START_HOUR).toBe(7);
    expect(NIGHT_START_HOUR).toBe(19);
  });

  it.each([
    ["00:00", at(0, 0), "dark"],
    ["01:00", at(1, 0), "dark"],
    ["06:59", at(6, 59), "dark"],
    ["07:00", at(7, 0), "light"],
    ["12:00", at(12, 0), "light"],
    ["18:59", at(18, 59), "light"],
    ["19:00", at(19, 0), "dark"],
    ["23:59", at(23, 59), "dark"],
  ] as const)("%s resolves to %s", (_label, date, expected) => {
    expect(resolveAutoTheme(date)).toBe(expected);
  });
});

interface BootResult {
  attributes: Record<string, string>;
  styles: Record<string, string>;
}

function runBootScript(storage: Record<string, string>, now: Date): BootResult {
  const attributes: Record<string, string> = {};
  const styles: Record<string, string> = {};
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor() {
      super(now.getTime());
    }
  }
  runInNewContext(THEME_BOOT_SCRIPT, {
    Date: FixedDate,
    Number,
    String,
    Math,
    isFinite,
    localStorage: { getItem: (key: string) => storage[key] ?? null },
    document: {
      documentElement: {
        setAttribute: (name: string, value: string) => {
          attributes[name] = value;
        },
        style: {
          setProperty: (name: string, value: string) => {
            styles[name] = value;
          },
        },
      },
    },
  });
  return { attributes, styles };
}

describe("THEME_BOOT_SCRIPT", () => {
  it("embeds the same hour boundaries as resolveAutoTheme", () => {
    expect(THEME_BOOT_SCRIPT).toContain(`hour >= ${DAY_START_HOUR}`);
    expect(THEME_BOOT_SCRIPT).toContain(`hour < ${NIGHT_START_HOUR}`);
    expect(THEME_BOOT_SCRIPT).not.toContain("prefers-color-scheme");
  });

  it.each([at(0), at(6, 59), at(7), at(18, 59), at(19), at(23, 59)])(
    "Auto at %s matches resolveAutoTheme",
    (date) => {
      expect(runBootScript({}, date).attributes["data-theme"]).toBe(resolveAutoTheme(date));
      expect(runBootScript({ hd_theme: "auto" }, date).attributes["data-theme"]).toBe(
        resolveAutoTheme(date),
      );
    },
  );

  it("keeps Day and Night forced regardless of the clock", () => {
    expect(runBootScript({ hd_theme: "light" }, at(1)).attributes["data-theme"]).toBe("light");
    expect(runBootScript({ hd_theme: "dark" }, at(12)).attributes["data-theme"]).toBe("dark");
  });

  it("still applies sidebar state and brightness", () => {
    const result = runBootScript({ hd_sidebar: "collapsed", hd_brightness: "80" }, at(12));
    expect(result.attributes["data-sidebar"]).toBe("collapsed");
    expect(result.styles["--hd-brightness-bg"]).toBe("#ffffff");
    expect(result.styles["--hd-brightness-opacity"]).toBe(String(Math.min(0.42, 30 / 120)));

    const defaults = runBootScript({}, at(12));
    expect(defaults.attributes["data-sidebar"]).toBe("expanded");
    expect(defaults.styles).toEqual({});
  });
});
