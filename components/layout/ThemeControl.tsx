"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, SunMoon } from "lucide-react";
import { DAY_START_HOUR, NIGHT_START_HOUR, resolveAutoTheme } from "@/lib/theme-schedule";

type ThemeMode = "auto" | "light" | "dark";

const THEME_KEY = "hd_theme";
const BRIGHTNESS_KEY = "hd_brightness";
/** How often Auto re-checks the clock so it flips at the boundary without reload. */
const AUTO_RECHECK_MS = 60_000;

function readStoredMode(): ThemeMode {
  const stored = localStorage.getItem(THEME_KEY);
  return stored === "light" || stored === "dark" ? stored : "auto";
}

/** Auto follows the viewer's local time of day (lib/theme-schedule.ts). */
function resolveTheme(mode: ThemeMode): "light" | "dark" {
  return mode === "auto" ? resolveAutoTheme(new Date()) : mode;
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.setAttribute("data-theme", resolveTheme(mode));
}

/**
 * Brightness is applied through a full-screen, pointer-transparent overlay in
 * soft-light blend mode (white brightens, black dims). This never re-layouts
 * the page — unlike CSS filter on a container, fixed elements keep working.
 */
function applyBrightness(value: number) {
  const delta = value - 50;
  const root = document.documentElement;
  root.style.setProperty("--hd-brightness-bg", delta >= 0 ? "#ffffff" : "#000000");
  root.style.setProperty("--hd-brightness-opacity", String(Math.min(0.42, Math.abs(delta) / 120)));
}

export function ThemeControl() {
  const [mode, setMode] = useState<ThemeMode>("auto");
  const [brightness, setBrightness] = useState(50);

  useEffect(() => {
    const storedMode = readStoredMode();
    const storedBrightness = Number(localStorage.getItem(BRIGHTNESS_KEY) ?? "50");
    const safeBrightness = Number.isFinite(storedBrightness) ? storedBrightness : 50;
    setMode(storedMode);
    setBrightness(safeBrightness);
    applyTheme(storedMode);
    applyBrightness(safeBrightness);
  }, []);

  // While Auto is selected, re-evaluate every minute and when the tab becomes
  // visible again. Picking Day/Night tears this down.
  useEffect(() => {
    if (mode !== "auto") return;
    const recheck = () => applyTheme("auto");
    const onVisibility = () => {
      if (document.visibilityState === "visible") recheck();
    };
    const timer = window.setInterval(recheck, AUTO_RECHECK_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [mode]);

  function handleMode(next: ThemeMode) {
    setMode(next);
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  }

  function handleBrightness(next: number) {
    setBrightness(next);
    localStorage.setItem(BRIGHTNESS_KEY, String(next));
    applyBrightness(next);
  }

  const pad = (hour: number) => String(hour).padStart(2, "0");
  const MODES: { value: ThemeMode; label: string; title: string; icon: React.ElementType }[] = [
    {
      value: "auto",
      label: "Auto",
      title: `Auto: light by day (${pad(DAY_START_HOUR)}:00–${pad(NIGHT_START_HOUR)}:00), dark at night`,
      icon: SunMoon,
    },
    { value: "light", label: "Day",   title: "Day mode: always light", icon: Sun },
    { value: "dark",  label: "Night", title: "Night mode: always dark", icon: Moon },
  ];

  return (
    <div className="px-3 py-2 space-y-2">
      <div role="group" aria-label="Theme" className="flex items-center gap-1">
        {MODES.map(({ value, label, title, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => handleMode(value)}
            aria-pressed={mode === value}
            title={title}
            className={`flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
              mode === value
                ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            }`}
          >
            <Icon className="h-3 w-3" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Moon className="h-3 w-3 shrink-0 text-[var(--color-text-muted)]" aria-hidden="true" />
        <input
          type="range"
          min={0}
          max={100}
          value={brightness}
          onChange={(e) => handleBrightness(Number(e.target.value))}
          aria-label="Screen brightness"
          title="Brightness"
          className="h-1 w-full cursor-pointer accent-indigo-500"
        />
        <Sun className="h-3 w-3 shrink-0 text-[var(--color-text-muted)]" aria-hidden="true" />
      </div>
    </div>
  );
}
