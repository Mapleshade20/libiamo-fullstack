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
	const value = env.AUTH_AUDIT_LOG?.trim().toLowerCase();
	return value === "1" || value === "true" || value === "yes" || value === "on";
}

/**
 * The visitor's address, for telling bulk sign-ups from one source apart. `X-Real-IP` comes first:
 * the reverse proxy sets it from the address it resolved itself, while the first `X-Forwarded-For`
 * entry is whatever the client (or a CDN in front) put there, and anyone can forge it.
 */
export function clientIp(headers: Headers | null | undefined): string | null {
	const real = headers?.get("x-real-ip")?.trim();
	return real || headers?.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

/**
 * One JSON line per account event, for operators to ship to whatever watches the logs. Off unless
 * `AUTH_AUDIT_LOG=true`, since the line carries an email address.
 */
export function logAuthEvent(env: Environment, event: AuthAuditEvent, details: Record<string, unknown>): void {
	if (!isAuthAuditLogEnabled(env)) return;
	try {
		console.info(JSON.stringify({ type: "auth-audit", event, at: new Date().toISOString(), ...details }));
	} catch {
		// Logging must never break the auth flow.
	}
}
