"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const StaffPresenceContext = createContext<ReadonlySet<string>>(new Set<string>());

/** Ids of staff currently connected, live from the socket. */
export function useStaffPresence(): ReadonlySet<string> {
  return useContext(StaffPresenceContext);
}

/**
 * One shared Realtime Presence channel per organization, mounted by the app
 * shell so every avatar reads the same socket instead of opening its own.
 *
 * Presence is *connection* truth, not a declared status: an id is in the set
 * only while that person holds an open channel, so closing the tab removes the
 * dot. That is deliberately narrower than `availability_status`, which is
 * self-declared and heartbeat-verified.
 *
 * Only staff track themselves; anyone in the organization may observe.
 */
export function StaffPresenceProvider({
  organizationId,
  userId,
  isStaff,
  children,
}: {
  organizationId: string | null;
  userId: string;
  isStaff: boolean;
  children: React.ReactNode;
}) {
  const [online, setOnline] = useState<ReadonlySet<string>>(() => new Set<string>());

  useEffect(() => {
    if (!organizationId) return;

    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let disposed = false;
    // Presence may only be pushed once the channel has actually joined —
    // pushing earlier throws "tried to push 'presence' before joining".
    let joined = false;

    async function connect() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (disposed || !session) return;

      // Realtime enforces RLS per subscriber, so the socket carries the user's
      // JWT, same as the operations console.
      supabase.realtime.setAuth(session.access_token);

      const presenceChannel = supabase.channel(`staff-presence-${organizationId}`, {
        config: { presence: { key: userId } },
      });
      channel = presenceChannel;

      presenceChannel
        .on("presence", { event: "sync" }, () => {
          const state = presenceChannel.presenceState();
          setOnline(new Set(Object.keys(state)));
        })
        .subscribe((status) => {
          if (disposed) return;
          joined = status === "SUBSCRIBED";
          if (joined && isStaff) {
            void presenceChannel.track({ online_at: new Date().toISOString() });
          }
          if (!joined) setOnline(new Set<string>());
        });
    }

    void connect();

    return () => {
      disposed = true;
      if (channel) {
        if (joined && isStaff) void channel.untrack();
        void supabase.removeChannel(channel);
      }
    };
  }, [organizationId, userId, isStaff]);

  const value = useMemo(() => online, [online]);

  return (
    <StaffPresenceContext.Provider value={value}>{children}</StaffPresenceContext.Provider>
  );
}
