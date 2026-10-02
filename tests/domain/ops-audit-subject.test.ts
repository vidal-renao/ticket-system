import { describe, expect, it } from "vitest";
import { complianceFromSnapshot } from "../../lib/ops/audit-subject";

const subject = (value: string) => ({ subject: value });

describe("SLA compliance read from the delivered report subject", () => {
  it("reads the original subject format", () => {
    expect(complianceFromSnapshot(subject("VIDAL Daily SLA Report: 100% compliance - 2026-08-01"))).toBe(100);
    expect(complianceFromSnapshot(subject("VIDAL Daily SLA Report: 87.5% compliance - 2026-08-02"))).toBe(87.5);
  });

  it("reads the verdict-first subject format", () => {
    expect(
      complianceFromSnapshot(subject("[Action required] 5 active tickets · 40% SLA · 3 unowned — Vidal Real Estate · 3 Oct"))
    ).toBe(40);
    expect(complianceFromSnapshot(subject("[All clear] 2 active tickets · 100% SLA — Acme · 4 Oct"))).toBe(100);
  });

  it("reports no number when the SLA could not be measured", () => {
    expect(
      complianceFromSnapshot(subject("[Needs attention] 5 active tickets · SLA not measured · 3 unowned — Org · 2 Oct"))
    ).toBeNull();
  });

  it("ignores snapshots without a usable subject", () => {
    expect(complianceFromSnapshot(null)).toBeNull();
    expect(complianceFromSnapshot({})).toBeNull();
    expect(complianceFromSnapshot(subject("3 unowned tickets"))).toBeNull();
  });
});
