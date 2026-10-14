import "server-only";
import { z } from "zod";
import { assertStripeConfig } from "./providers/payments/stripe-mode";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Database. Runtime prefers the transaction pooler; migrations use DATABASE_URL.
  DATABASE_URL: z.string().url(),
  DATABASE_URL_POOLER: z.string().url().optional(),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),

  // App
  APP_URL: z.string().url(),
  CRON_SECRET: z.string().min(16),

  // Providers (swap `mock`/`console` for the real thing when those accounts exist)
  PAYMENTS_PROVIDER: z.enum(["mock", "stripe"]).default("mock"),
  EMAIL_PROVIDER: z.enum(["console", "resend", "mailtrap"]).default("console"),
  STRIPE_SECRET_KEY: z.string().optional(),
  // Public by design (it is sent to the browser to load Stripe's card form).
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  MAILTRAP_API_TOKEN: z.string().optional(),
  // Must be an address on a domain verified in Mailtrap (e.g. chosenprayer.com).
  EMAIL_FROM: z.string().email().optional(),
  EMAIL_FROM_NAME: z.string().default("Chosen Prayer"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/**
 * Validated environment. Parsed lazily (not at import) so that `next build` on a
 * machine without secrets still works; the first real use fails fast with a
 * readable list of what is missing.
 */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid server environment:\n${problems}`);
  }
  const env = parsed.data;
  if (env.PAYMENTS_PROVIDER === "stripe") assertStripeConfig(env);
  if (env.EMAIL_PROVIDER === "resend" && !env.RESEND_API_KEY) {
    throw new Error("EMAIL_PROVIDER=resend requires RESEND_API_KEY");
  }
  if (env.EMAIL_PROVIDER === "mailtrap" && !(env.MAILTRAP_API_TOKEN && env.EMAIL_FROM)) {
    throw new Error("EMAIL_PROVIDER=mailtrap requires MAILTRAP_API_TOKEN and EMAIL_FROM");
  }
  cached = env;
  return env;
}

export const isProd = () => process.env.NODE_ENV === "production";
