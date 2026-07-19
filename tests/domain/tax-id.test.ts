import { describe, expect, it } from "vitest";
import { cifControlChar, generateCif, isValidGeneratedCif } from "../../lib/tax-id";
import { matchesTicketQuery, ticketRefTokens } from "../../lib/ticket-search";

describe("automatic CIF/NIF generation", () => {
  it("produces a well-formed CIF (letter + 7 digits + control)", () => {
    const cif = generateCif("Acme AG");
    expect(cif).toMatch(/^B\d{7}[0-9]$/);
    expect(isValidGeneratedCif(cif)).toBe(true);
  });

  it("is deterministic for the same company name", () => {
    expect(generateCif("Empresa Cliente 1")).toBe(generateCif("Empresa Cliente 1"));
    expect(generateCif("Empresa Cliente 1")).not.toBe(generateCif("Empresa Cliente 2"));
  });

  it("computes the official control character", () => {
    // 5896177: odd positions doubled (5→1, 9→9, 1→2, 7→5) = 17; even = 8+6+7 = 21;
    // total 38 → control (10 - 8) % 10 = 2.
    expect(cifControlChar("B", "5896177")).toBe("2");
    expect(isValidGeneratedCif("B58961772")).toBe(true);
    expect(isValidGeneratedCif("B58961770")).toBe(false);
  });
});

describe("smart ticket search", () => {
  const fields = [...ticketRefTokens(42), "VPN outage in Basel office", "Acme AG", "critical"];

  it("matches ticket references in every common form", () => {
    expect(matchesTicketQuery("TK-0042", fields)).toBe(true);
    expect(matchesTicketQuery("0042", fields)).toBe(true);
    expect(matchesTicketQuery("42", fields)).toBe(true);
  });

  it("requires all tokens but in any order and field", () => {
    expect(matchesTicketQuery("acme vpn", fields)).toBe(true);
    expect(matchesTicketQuery("critical basel", fields)).toBe(true);
    expect(matchesTicketQuery("acme printer", fields)).toBe(false);
  });

  it("ignores accents and case", () => {
    expect(matchesTicketQuery("BÁSEL", fields)).toBe(true);
  });

  it("empty query matches everything", () => {
    expect(matchesTicketQuery("", fields)).toBe(true);
    expect(matchesTicketQuery(undefined, fields)).toBe(true);
  });
});
