import { describe, expect, it } from "vitest";
import {
  createCompanyCustomerSchema,
  createIndividualCustomerSchema,
  selfServiceProfileSchema,
} from "@/lib/validation/security";

describe("Phase 4A.14 identity contracts", () => {
  describe("selfServiceProfileSchema", () => {
    it("accepts the self-service editable fields", () => {
      expect(
        selfServiceProfileSchema.safeParse({
          full_name: "Jane Doe",
          phone: "+41 79 000 00 00",
          locale: "de",
          address: "Bahnhofstrasse 1",
          city: "Basel",
          postal_code: "4001",
          country: "CH",
        }).success
      ).toBe(true);
    });

    it("strips role/organization_id/customer_type/reference_code even if present in the raw payload", () => {
      const parsed = selfServiceProfileSchema.safeParse({
        full_name: "Jane Doe",
        role: "admin",
        organization_id: "11111111-1111-4111-8111-111111111111",
        customer_type: "company",
        reference_code: "VRE-ADM-AAAA-AAAA",
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data).not.toHaveProperty("role");
        expect(parsed.data).not.toHaveProperty("organization_id");
        expect(parsed.data).not.toHaveProperty("customer_type");
        expect(parsed.data).not.toHaveProperty("reference_code");
      }
    });

    it("rejects an unsupported locale", () => {
      expect(selfServiceProfileSchema.safeParse({ locale: "xx" }).success).toBe(false);
    });

    it("rejects a malformed website URL", () => {
      expect(selfServiceProfileSchema.safeParse({ website: "not-a-url" }).success).toBe(false);
    });
  });

  describe("createIndividualCustomerSchema", () => {
    const base = {
      first_name: "Angel",
      last_name: "Muster",
      email: "angel@example.ch",
    };

    it("accepts the minimal required fields", () => {
      expect(createIndividualCustomerSchema.safeParse(base).success).toBe(true);
    });

    it("rejects a missing first name", () => {
      expect(createIndividualCustomerSchema.safeParse({ ...base, first_name: "" }).success).toBe(false);
    });

    it("rejects an invalid email", () => {
      expect(createIndividualCustomerSchema.safeParse({ ...base, email: "not-an-email" }).success).toBe(false);
    });

    it("has no field for role, organization_id, customer_type or reference_code -- a manipulated payload cannot supply them", () => {
      const parsed = createIndividualCustomerSchema.safeParse({
        ...base,
        role: "admin",
        organization_id: "11111111-1111-4111-8111-111111111111",
        customer_type: "company",
        reference_code: "VRE-CUS-AAAA-AAAA",
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data).not.toHaveProperty("role");
        expect(parsed.data).not.toHaveProperty("organization_id");
        expect(parsed.data).not.toHaveProperty("customer_type");
        expect(parsed.data).not.toHaveProperty("reference_code");
      }
    });
  });

  describe("createCompanyCustomerSchema", () => {
    const base = {
      legal_name: "Pharma Cosmetics AG",
      contact_email: "contact@pharma-cosmetics.ch",
      contact_person: "Maria Rossi",
    };

    it("accepts the minimal required fields", () => {
      expect(createCompanyCustomerSchema.safeParse(base).success).toBe(true);
    });

    it("rejects a missing legal name", () => {
      expect(createCompanyCustomerSchema.safeParse({ ...base, legal_name: "" }).success).toBe(false);
    });

    it("rejects a missing contact person", () => {
      expect(createCompanyCustomerSchema.safeParse({ ...base, contact_person: "" }).success).toBe(false);
    });

    it("rejects an invalid contact email", () => {
      expect(createCompanyCustomerSchema.safeParse({ ...base, contact_email: "nope" }).success).toBe(false);
    });

    it("has no field for role, organization_id or reference_code -- a manipulated payload cannot supply them, and cannot force customer_type either", () => {
      const parsed = createCompanyCustomerSchema.safeParse({
        ...base,
        role: "admin",
        organization_id: "11111111-1111-4111-8111-111111111111",
        customer_type: "individual",
        reference_code: "VRE-COM-AAAA-AAAA",
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data).not.toHaveProperty("role");
        expect(parsed.data).not.toHaveProperty("organization_id");
        expect(parsed.data).not.toHaveProperty("customer_type");
        expect(parsed.data).not.toHaveProperty("reference_code");
      }
    });
  });
});
