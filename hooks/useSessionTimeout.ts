"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Sessions are never eternal: 30 minutes without user activity signs the
// session out for every role (admin, company, agent). A countdown warning is
// shown during the final 2 minutes so active users can extend.
const TIMEOUT_MS = 30 * 60 * 1000;
const WARNING_MS = 2 * 60 * 1000;

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
] as const;

export function useSessionTimeout(onTimeout: () => void) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const lastActivity = useRef(Date.now());
  const timedOut = useRef(false);

  const reset = useCallback(() => {
    lastActivity.current = Date.now();
    setSecondsLeft(null);
  }, []);

  useEffect(() => {
    const handler = () => {
      lastActivity.current = Date.now();
    };

    ACTIVITY_EVENTS.forEach((e) =>
      window.addEventListener(e, handler, { passive: true })
    );

    const ticker = window.setInterval(() => {
      if (timedOut.current) return;
      const idle = Date.now() - lastActivity.current;
      const remaining = TIMEOUT_MS - idle;

      if (remaining <= 0) {
        timedOut.current = true;
        setSecondsLeft(0);
        onTimeout();
        return;
      }

      if (remaining <= WARNING_MS) {
        setSecondsLeft(Math.ceil(remaining / 1000));
      } else {
        setSecondsLeft(null);
      }
    }, 1000);

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, handler));
      window.clearInterval(ticker);
    };
  }, [onTimeout]);

  return {
    isWarning: secondsLeft !== null && secondsLeft > 0,
    secondsLeft: secondsLeft ?? 0,
    reset,
  };
}
