import { describe, expect, it } from "vitest";
import {
  isAgentAvailable,
  partitionAgentOptions,
  sortAgentOptions,
  type AgentOption,
} from "../../lib/agent-options";
import { effectivePresence } from "../../lib/presence";

const agent = (id: string, name: string, presence: AgentOption["presence"]): AgentOption => ({
  id,
  name,
  presence,
});

describe("who counts as available to take a ticket", () => {
  it("treats only online as available", () => {
    expect(isAgentAvailable("online")).toBe(true);
    expect(isAgentAvailable("busy")).toBe(false);
    expect(isAgentAvailable("offline")).toBe(false);
  });

  it("agrees with the rule routing uses", () => {
    // Both sides must answer the same question the same way, or the selector
    // would offer as "available" someone the router refuses to pick.
    const now = Date.parse("2026-08-12T12:00:00Z");
    const fresh = new Date(now - 60_000).toISOString();
    const stale = new Date(now - 10 * 60_000).toISOString();

    expect(isAgentAvailable(effectivePresence("online", fresh, now))).toBe(true);
    expect(isAgentAvailable(effectivePresence("busy", fresh, now))).toBe(false);
    expect(isAgentAvailable(effectivePresence("online", stale, now))).toBe(false);
    expect(isAgentAvailable(effectivePresence("online", null, now))).toBe(false);
  });
});

describe("ordering the reassignment list", () => {
  it("puts the available first, then busy, then offline", () => {
    const sorted = sortAgentOptions([
      agent("c", "Carla", "offline"),
      agent("a", "Ana", "busy"),
      agent("b", "Bruno", "online"),
    ]);
    expect(sorted.map((option) => option.id)).toEqual(["b", "a", "c"]);
  });

  it("ranks busy above offline", () => {
    // Both unavailable, but someone marked busy is at their desk and will see
    // the ticket; offline may not look for hours.
    const sorted = sortAgentOptions([agent("off", "Aaa", "offline"), agent("busy", "Zzz", "busy")]);
    expect(sorted[0].id).toBe("busy");
  });

  it("sorts alphabetically inside each band", () => {
    const sorted = sortAgentOptions([
      agent("2", "Zoe", "online"),
      agent("1", "Ana", "online"),
      agent("4", "Bea", "offline"),
      agent("3", "Adam", "offline"),
    ]);
    expect(sorted.map((option) => option.name)).toEqual(["Ana", "Zoe", "Adam", "Bea"]);
  });

  it("does not reorder the caller's array", () => {
    const input = [agent("c", "Carla", "offline"), agent("b", "Bruno", "online")];
    const snapshot = [...input];
    sortAgentOptions(input);
    expect(input).toEqual(snapshot);
  });

  it("handles an empty roster", () => {
    expect(sortAgentOptions([])).toEqual([]);
  });
});

describe("splitting the list into the two rendered bands", () => {
  it("separates available from everyone else, each already sorted", () => {
    const { available, unavailable } = partitionAgentOptions([
      agent("c", "Carla", "offline"),
      agent("a", "Ana", "online"),
      agent("b", "Bruno", "busy"),
    ]);
    expect(available.map((option) => option.id)).toEqual(["a"]);
    expect(unavailable.map((option) => option.id)).toEqual(["b", "c"]);
  });

  it("yields an empty available band when nobody is online", () => {
    // The state the organization is actually in most of the time; the control
    // must still render every agent, just all of them in the second band.
    const { available, unavailable } = partitionAgentOptions([
      agent("a", "Ana", "offline"),
      agent("b", "Bruno", "busy"),
    ]);
    expect(available).toEqual([]);
    expect(unavailable).toHaveLength(2);
  });

  it("loses nobody in the split", () => {
    const agents = [
      agent("a", "Ana", "online"),
      agent("b", "Bruno", "busy"),
      agent("c", "Carla", "offline"),
    ];
    const { available, unavailable } = partitionAgentOptions(agents);
    expect(available.length + unavailable.length).toBe(agents.length);
  });
});
