/**
 * Every timestamp in the UI is shown in Swiss time.
 *
 * Without an explicit zone, `toLocaleString` uses the runtime's zone: UTC on
 * the Vercel server, the viewer's zone in the browser. The same moment then
 * rendered as "13 Nov, 23:38" on a full page load and "14 Nov, 00:38" after a
 * client refresh (found on TK-0084, 2026-11-14). The product serves Swiss and
 * DACH SMEs, so one fixed zone is the honest choice.
 */
export const APP_TIME_ZONE = "Europe/Zurich";

