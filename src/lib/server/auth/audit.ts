import { envFlag } from "$lib/server/env";

type Environment = Record<string, string | undefined>;

export type AuthAuditEvent =
	| "auth.sign_up"
	| "auth.email_change_requested"
	| "auth.email_changed"
	| "auth.password_changed"
	| "auth.password_reset"
	| "auth.account_linked"
	| "auth.account_unlinked";

export function isAuthAuditLogEnabled(env: Environment): boolean {
	return envFlag(env.AUTH_AUDIT_LOG, false);
}

/**
 * The visitor's address, read from the same `ADDRESS_HEADER` adapter-node trusts (the reverse proxy
 * overwrites it). Without that header configured any request header is client-supplied, so there is
 * no address rather than a forgeable one.
 */
export function clientIp(env: Environment, headers: Headers | null | undefined): string | null {
	const header = env.ADDRESS_HEADER?.trim();
	if (!header) return null;
	return headers?.get(header)?.split(",")[0]?.trim() || null;
}

/**
 * One JSON line per account event, for operators to ship to whatever watches the logs. Off unless
 * `AUTH_AUDIT_LOG=1`, since the line carries an email address.
 */
export function logAuthEvent(env: Environment, event: AuthAuditEvent, details: Record<string, unknown>): void {
	if (!isAuthAuditLogEnabled(env)) return;
	try {
		console.info(JSON.stringify({ type: "auth-audit", event, at: new Date().toISOString(), ...details }));
	} catch {
		// Logging must never break the auth flow.
	}
}
