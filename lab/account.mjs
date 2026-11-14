// A development account for the recorder and replays, signed in, verified, set up and holding a key, in one step:
//
//   KEY=sk-or-... node lab/account.mjs http://127.0.0.1:5180 [email] > /tmp/cookie
//
// The server must run with SMTP_HOST and the Turnstile keys empty. Prints the session cookie (COOKIE for
// lab/record.mjs and lab/replay.mjs). The key is stored as the app stores one (AES-GCM under BETTER_AUTH_SECRET); a
// replay never reaches the provider, so any KEY does for it. The provider and model are the recommended setup's,
// which the baseline was recorded on.
import { createCipheriv, randomBytes, scryptSync } from "node:crypto";
import postgres from "postgres";

process.loadEnvFile(".env");
const [origin, email = "recorder@example.test"] = process.argv.slice(2);
if (!origin) {
	console.error("usage: KEY=... node lab/account.mjs <origin> [email]");
	process.exit(2);
}
const password = "replay-baseline-2026!";
const post = (path, body) =>
	fetch(`${origin}/api/auth/${path}`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });

await post("sign-up/email", { name: "Recorder", email, password });
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const [u] = await sql`
	update "user" set email_verified = true, native_language = 'zh-CN', learning_languages = '{en,es}', active_language = 'en',
	onboarded_at = coalesce(onboarded_at, now()) where email = ${email} returning id`;
if (!u) throw new Error(`no account for ${email}`);
const iv = randomBytes(16);
const cipher = createCipheriv("aes-256-gcm", scryptSync(process.env.BETTER_AUTH_SECRET, "libiamo-api-key-salt", 32), iv);
const data = Buffer.concat([cipher.update(process.env.KEY || "replay-only", "utf8"), cipher.final()]);
const encrypted = `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${data.toString("hex")}`;
await sql`
	insert into user_key (user_id, provider, model, encrypted_key) values (${u.id}, 'openrouter', '~anthropic/claude-haiku-latest', ${encrypted})
	on conflict (user_id) do update set provider = excluded.provider, model = excluded.model, encrypted_key = excluded.encrypted_key`;
await sql.end();

const r = await post("sign-in/email", { email, password });
const cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]);
if (!r.ok || !cookie.length) throw new Error(`sign-in failed: ${r.status}`);
console.log(cookie.join("; "));
