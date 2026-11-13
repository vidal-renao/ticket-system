import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import {
  MANUAL_CUSTOMER_WINDOW_HOURS,
  MANUAL_GOOD_TO_KNOW,
  MANUAL_STAGES,
} from "@/lib/manual-content";

const root = join(__dirname, "..", "..");

function keyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) => keyPaths(child, prefix ? `${prefix}.${key}` : key))
    .sort();
}

function leaf(messages: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>(
    (node, key) => (node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined),
    messages
  );
}

describe("admin manual messages", () => {
  const locales = { de: de.manual, en: en.manual, es: es.manual };

  it("has identical key sets in de, en and es", () => {
    const reference = keyPaths(locales.en);
    expect(reference.length).toBeGreaterThan(0);
    expect(keyPaths(locales.de)).toEqual(reference);
    expect(keyPaths(locales.es)).toEqual(reference);
  });

  it("defines every key the page renders", () => {
    for (const [locale, messages] of Object.entries(locales)) {
      for (const stage of MANUAL_STAGES) {
        const keys = ["title", "summary", "result", ...stage.steps, ...stage.images.map((image) => image.altKey)];
        for (const key of keys) {
          const value = leaf(messages, `stages.${stage.id}.${key}`);
          expect(typeof value, `${locale}: stages.${stage.id}.${key}`).toBe("string");
        }
      }
      for (const key of MANUAL_GOOD_TO_KNOW) {
        expect(typeof leaf(messages, `goodToKnow.${key}`), `${locale}: goodToKnow.${key}`).toBe("string");
      }
    }
  });

  it("uses Swiss German spelling", () => {
    expect(JSON.stringify(locales.de)).not.toContain("ß");
  });
});

describe("admin manual content", () => {
  it("ships every referenced screenshot", () => {
    for (const image of MANUAL_STAGES.flatMap((stage) => stage.images)) {
      expect(existsSync(join(root, "public", image.src)), image.src).toBe(true);
    }
  });

  it("states the reopen and auto-close window the code enforces", () => {
    const reopen = readFileSync(join(root, "app/api/tickets/[id]/reopen/route.ts"), "utf8");
    const cron = readFileSync(join(root, "app/api/cron/sla/route.ts"), "utf8");
    const customer = readFileSync(join(root, "components/tickets/CustomerResolutionActions.tsx"), "utf8");
    expect(reopen).toContain(`REOPEN_WINDOW_HOURS = ${MANUAL_CUSTOMER_WINDOW_HOURS};`);
    expect(customer).toContain(`REOPEN_WINDOW_HOURS = ${MANUAL_CUSTOMER_WINDOW_HOURS};`);
    expect(cron).toContain(`AUTO_CLOSE_AFTER_HOURS = ${MANUAL_CUSTOMER_WINDOW_HOURS};`);
  });
});
