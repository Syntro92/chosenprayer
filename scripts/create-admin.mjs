/**
 * Makes someone an admin or moderator (creating the account if needed).
 *
 *   npm run admin:create -- you@example.com
 *       promotes an EXISTING account to admin
 *
 *   npm run admin:create -- you@example.com --role moderator
 *       gives an existing account moderator tools instead (--role member removes them)
 *
 *   ADMIN_NEW_PASSWORD='a-strong-password' npm run admin:create -- you@example.com --name "Your Name"
 *       creates a confirmed account with that password (if none exists) and makes it admin
 *
 * The password is read from the ADMIN_NEW_PASSWORD env var rather than a flag, so it
 * doesn't end up in your shell history or process list. It is never printed.
 */
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase();
const nameFlag = args.indexOf("--name");
const name = nameFlag >= 0 ? args[nameFlag + 1] : undefined;
const roleFlag = args.indexOf("--role");
const role = roleFlag >= 0 ? args[roleFlag + 1] : "admin";
const password = process.env.ADMIN_NEW_PASSWORD;

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !["admin", "moderator", "member"].includes(role)) {
  console.error("Usage: npm run admin:create -- <email> [--role admin|moderator|member] [--name \"Full Name\"]   (set ADMIN_NEW_PASSWORD to create a new account)");
  process.exit(1);
}
for (const k of ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[k]) {
    console.error(`${k} is not set (run through npm so .env is loaded)`);
    process.exit(1);
  }
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  let { rows } = await client.query("select id from auth.users where lower(email) = $1", [email]);

  if (rows.length === 0) {
    if (!password) {
      console.error(`No account exists for ${email}.\nSet ADMIN_NEW_PASSWORD (8+ chars) to create one, or sign up on the site first and re-run this.`);
      process.exitCode = 1;
    } else if (password.length < 8) {
      console.error("ADMIN_NEW_PASSWORD must be at least 8 characters.");
      process.exitCode = 1;
    } else {
      const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // no confirmation email needed for the first admin
        user_metadata: { full_name: name ?? "Admin" },
      });
      if (error) throw new Error(`Could not create the account: ${error.message}`);
      rows = [{ id: data.user.id }];
      console.log(`Created account for ${email}`);
    }
  }

  if (rows.length > 0) {
    const res = await client.query(
      "update public.profiles set role = $2, status = 'active' where id = $1 returning username, role",
      [rows[0].id, role],
    );
    if (res.rowCount === 0) throw new Error("Account exists but has no profile row (the sign-up trigger did not run).");
    console.log(`OK: ${email} (@${res.rows[0].username}) is now ${role === "member" ? "a regular member" : `a${role === "admin" ? "n" : ""} ${role}`}.`);
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
