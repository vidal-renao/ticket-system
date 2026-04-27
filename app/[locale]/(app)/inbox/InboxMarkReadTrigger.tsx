"use client";

import { useEffect } from "react";

/** Silently marks all comment.public notifications as read when inbox is opened. */
export function InboxMarkReadTrigger() {
  useEffect(() => {
    fetch("/api/notifications", { method: "PATCH" }).catch(() => {});
  }, []);
  return null;
}
