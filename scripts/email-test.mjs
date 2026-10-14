// Usage: npm run email:test -- you@example.com   (needs EMAIL_PROVIDER=mailtrap + creds in .env.local)
import { spawnSync } from "node:child_process";
const to = process.argv[2];
if (!to) { console.error("Usage: npm run email:test -- <address>"); process.exit(1); }
const r = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/manual/send-test-email.test.ts"], {
  stdio: "inherit", env: { ...process.env, SEND_TEST_TO: to, SEND_TEST_TEMPLATE: process.argv[3] ?? "donation_receipt" },
});
process.exit(r.status ?? 1);
