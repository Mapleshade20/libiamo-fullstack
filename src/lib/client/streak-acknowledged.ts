import type { AcknowledgedStreak } from "$lib/streak";

/**
 * Keyed by user id, not by email: an email can be changed in Profile, and keying on it would
 * silently replay every streak animation after a change.
 */
export function acknowledgedStreakKey(userId: string) {
	return `libiamo:streak-ack:${userId}`;
}

export function readAcknowledgedStreak(userId: string): AcknowledgedStreak | null {
	if (typeof localStorage === "undefined") return null;
	try {
		const raw = localStorage.getItem(acknowledgedStreakKey(userId));
		if (!raw) return null;
		const value = JSON.parse(raw) as Partial<AcknowledgedStreak>;
		if (
			typeof value.day !== "string" ||
			!Number.isInteger(value.days) ||
			!Number.isInteger(value.bank) ||
			!["lit", "pending", "none"].includes(String(value.status))
		) {
			return null;
		}
		return value as AcknowledgedStreak;
	} catch {
		return null;
	}
}

export function writeAcknowledgedStreak(userId: string, value: AcknowledgedStreak) {
	if (typeof localStorage === "undefined") return;
	try {
		localStorage.setItem(acknowledgedStreakKey(userId), JSON.stringify(value));
	} catch {
		// Local storage can be unavailable in restricted browser contexts.
	}
}

export function clearAcknowledgedStreak(userId: string) {
	if (typeof localStorage === "undefined") return;
	try {
		localStorage.removeItem(acknowledgedStreakKey(userId));
	} catch {
		// Local storage can be unavailable in restricted browser contexts.
	}
}
