import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // `server-only` throws outside a Next server bundle; make it a no-op under test.
      "server-only": path.resolve(import.meta.dirname, "tests/helpers/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    // Real .env values so DB tests hit the actual database (inside rolled-back transactions).
    // Tests run on the mock provider whatever .env says, except the opt-in live Stripe check.
    env: { ...loadEnv("test", process.cwd(), ""), PAYMENTS_PROVIDER: process.env.STRIPE_LIVE_TEST === "1" ? "stripe" : "mock" },
    testTimeout: 20_000,
    // Matchers like toBeInTheDocument(); harmless for the node-environment tests.
    setupFiles: ["tests/helpers/dom-setup.ts"],
  },
});
