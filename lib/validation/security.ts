import { z } from "zod";

export const PERMISSION_DENIED_MESSAGE =
  "No tienes permisos suficientes para realizar esta acción o el recurso es privado";

export const PASSWORD_POLICY_MESSAGE =
  "Password must be at least 12 characters and include uppercase, lowercase, number, and symbol";

const passwordChecks = [
  { test: (value: string) => value.length >= 12, label: "12+ chars" },
  { test: (value: string) => /[A-Z]/.test(value), label: "Uppercase" },
  { test: (value: string) => /[a-z]/.test(value), label: "Lowercase" },
  { test: (value: string) => /[0-9]/.test(value), label: "Number" },
  { test: (value: string) => /[^A-Za-z0-9]/.test(value), label: "Symbol" },
] as const;

export function evaluatePasswordRequirements(password: string) {
  return passwordChecks.map((check) => ({
    label: check.label,
    met: check.test(password),
  }));
}

export function getPasswordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  const metCount = evaluatePasswordRequirements(password).filter((item) => item.met).length;
  if (password.length === 0) return 0;
  if (metCount <= 1) return 0;
  if (metCount === 2) return 1;
  if (metCount === 3) return 2;
  if (metCount === 4) return 3;
  return 4;
}

export const passwordSchema = z
  .string()
  .min(12, PASSWORD_POLICY_MESSAGE)
  .regex(/[A-Z]/, PASSWORD_POLICY_MESSAGE)
  .regex(/[a-z]/, PASSWORD_POLICY_MESSAGE)
  .regex(/[0-9]/, PASSWORD_POLICY_MESSAGE)
  .regex(/[^A-Za-z0-9]/, PASSWORD_POLICY_MESSAGE);

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Full name is required"),
  email: z.string().trim().email("Valid email is required"),
  password: passwordSchema,
  org_code: z.string().trim().uuid("Organization code must be a valid UUID"),
  role: z.literal("customer").default("customer"),
  company_name: z.string().optional(),
  industry: z.string().optional(),
  business_details: z.string().optional(),
  tax_id: z.string().optional(),
});

export const customerProfileSchema = z.object({
  company_name: z.string().trim().min(1, "Company name is required"),
  industry: z.string().trim().max(120, "Industry must be 120 characters or fewer"),
  business_details: z.string().trim().max(500, "Business details must be 500 characters or fewer"),
  tax_id: z.string().trim().max(80, "Tax ID must be 80 characters or fewer"),
});

export function normalizeSupabaseErrorMessage(error: { message?: string | null; code?: string | null } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  const code = error?.code ?? "";

  if (
    code === "42501" ||
    message.includes("row-level security") ||
    message.includes("violates row-level security") ||
    message.includes("permission denied") ||
    message.includes("not allowed") ||
    message.includes("insufficient privilege")
  ) {
    return PERMISSION_DENIED_MESSAGE;
  }

  return error?.message ?? "Unexpected Supabase error";
}
