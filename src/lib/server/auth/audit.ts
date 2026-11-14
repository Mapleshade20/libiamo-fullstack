import { ADDRESS_HEADER, AUTH_AUDIT_LOG } from "$app/env/private";

export type AuthAuditEvent =
	| "auth.sign_up"
	| "auth.email_change_requested"
	| "auth.email_changed"
	| "auth.password_changed"
	| "auth.password_reset"
	| "auth.account_linked"
	| "auth.account_unlinked"
	| "auth.admin_granted"
	| "auth.account_deleted";

/**
 * The visitor's address, from the header the reverse proxy overwrites (the one adapter-node trusts). Without it any
 * header is the client's own, so there is no address rather than a forgeable one.
 */
export function clientIp(headers: Headers | null | undefined): string | null {
	if (!ADDRESS_HEADER) return null;
	return headers?.get(ADDRESS_HEADER)?.split(",")[0]?.trim() || null;
}

/** One JSON line per account event for whatever watches the logs; off unless AUTH_AUDIT_LOG, since it carries an address. */
export function logAuthEvent(event: AuthAuditEvent, details: Record<string, unknown>): void {
	if (!AUTH_AUDIT_LOG) return;
	try {
		console.info(JSON.stringify({ type: "auth-audit", event, at: new Date().toISOString(), ...details }));
	} catch {
		// Logging never breaks the flow.
	}
}
