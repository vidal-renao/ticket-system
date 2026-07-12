import { describe, expect, it } from "vitest";
import { registerSchema } from "../../lib/validation/security";

const validRegistration = {
  name: "Test Customer",
  email: "customer@example.test",
  password: "StrongPassword!2026",
  org_code: "00000000-0000-4000-8000-000000000001",
  role: "customer" as const,
};

describe("registerSchema", () => {
  it("accepts customer self-registration", () => {
    expect(registerSchema.safeParse(validRegistration).success).toBe(true);
  });

  it("rejects public agent registration", () => {
    expect(
      registerSchema.safeParse({ ...validRegistration, role: "employee" }).success
    ).toBe(false);
  });

  it("enforces the password policy", () => {
    expect(
      registerSchema.safeParse({ ...validRegistration, password: "weak" }).success
    ).toBe(false);
  });
});
