import { DAY_START_HOUR, NIGHT_START_HOUR } from "./theme-schedule";

/**
 * Inline script that applies the stored theme, sidebar state and brightness
 * before first paint (no flash). Auto uses the same hour boundaries as
 * resolveAutoTheme; they are interpolated from the constants, never copied.
 */
export const THEME_BOOT_SCRIPT = `
(function () {
  try {
    var mode = localStorage.getItem("hd_theme") || "auto";
    var hour = new Date().getHours();
    var resolved = mode === "light" || mode === "dark"
      ? mode
      : (hour >= ${DAY_START_HOUR} && hour < ${NIGHT_START_HOUR} ? "light" : "dark");
    document.documentElement.setAttribute("data-theme", resolved);
    // Sidebar rail state, applied here so a collapsed rail never flashes open.
    document.documentElement.setAttribute(
      "data-sidebar",
      localStorage.getItem("hd_sidebar") === "collapsed" ? "collapsed" : "expanded"
    );
    var b = Number(localStorage.getItem("hd_brightness") || "50");
    if (isFinite(b) && b !== 50) {
      document.documentElement.style.setProperty("--hd-brightness-bg", b >= 50 ? "#ffffff" : "#000000");
      document.documentElement.style.setProperty("--hd-brightness-opacity", String(Math.min(0.42, Math.abs(b - 50) / 120)));
    }
  } catch (e) {}
})();
`;
