/**
 * Time-of-day rule for the "Auto" theme. Single source of truth: the client
 * control and the inline boot script (lib/theme-boot-script.ts) both use it.
 * Light from DAY_START_HOUR:00 to NIGHT_START_HOUR-1:59, dark otherwise,
 * evaluated in the viewer's local time.
 */
export const DAY_START_HOUR = 7;
export const NIGHT_START_HOUR = 19;

export type ResolvedTheme = "light" | "dark";

export function resolveAutoTheme(date: Date): ResolvedTheme {
  const hour = date.getHours();
  return hour >= DAY_START_HOUR && hour < NIGHT_START_HOUR ? "light" : "dark";
}
