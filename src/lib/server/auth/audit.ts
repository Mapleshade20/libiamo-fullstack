type Environment = Record<string, string | undefined>;

export type AuthAuditEvent = "auth.sign_up" | "auth.email_change_requested" | "auth.email_changed";

export function isAuthAuditLogEnabled(env: Environment): boolean {
	const value = env.AUTH_AUDIT_LOG?.trim().toLowerCase();
	return value === "1" || value === "true" || value === "yes" || value === "on";
}

/** The first hop the reverse proxy reports, for telling bulk sign-ups from one source apart. */
export function clientIp(headers: Headers | null | undefined): string | null {
	const forwarded = headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
	return forwarded || headers?.get("x-real-ip")?.trim() || null;
}

/**
 * One JSON line per account event, for operators to ship to whatever watches the logs. Off unless
 * `AUTH_AUDIT_LOG` is set, since the line carries an email address.
 */
export function logAuthEvent(env: Environment, event: AuthAuditEvent, details: Record<string, unknown>): void {
	if (!isAuthAuditLogEnabled(env)) return;
	try {
		console.info(JSON.stringify({ type: "auth-audit", event, at: new Date().toISOString(), ...details }));
	} catch {
		// Logging must never break the auth flow.
	}
}
