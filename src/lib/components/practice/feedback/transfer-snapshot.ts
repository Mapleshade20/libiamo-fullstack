import { isTransferQueueState, type TransferQueueState } from "$lib/review/transfer-queue";

const SCHEMA_VERSION = 1;

export type PracticeTransferSnapshot = {
	schemaVersion: typeof SCHEMA_VERSION;
	sessionId: number;
	/** The note ids the pass started over, so a changed set discards a stale queue. */
	noteIds: number[];
	transfer: TransferQueueState;
};

export function practiceTransferSnapshotKey(sessionId: number) {
	return `libiamo:practice-transfer:${sessionId}`;
}

export function parsePracticeTransferSnapshot(raw: string | null, expected: { sessionId: number; noteIds: number[] }) {
	if (!raw) return null;
	try {
		const value = JSON.parse(raw) as Partial<PracticeTransferSnapshot>;
		if (
			value.schemaVersion !== SCHEMA_VERSION ||
			value.sessionId !== expected.sessionId ||
			!Array.isArray(value.noteIds) ||
			value.noteIds.join(",") !== expected.noteIds.join(",") ||
			!isTransferQueueState(value.transfer)
		) {
			return null;
		}
		return value as PracticeTransferSnapshot;
	} catch {
		return null;
	}
}

export function savePracticeTransferSnapshot(snapshot: PracticeTransferSnapshot) {
	if (typeof sessionStorage === "undefined") return;
	try {
		sessionStorage.setItem(practiceTransferSnapshotKey(snapshot.sessionId), JSON.stringify(snapshot));
	} catch {
		// Session storage can be unavailable in restricted browser contexts.
	}
}

export function clearPracticeTransferSnapshot(sessionId: number) {
	if (typeof sessionStorage === "undefined") return;
	try {
		sessionStorage.removeItem(practiceTransferSnapshotKey(sessionId));
	} catch {
		// Session storage can be unavailable in restricted browser contexts.
	}
}

export function emptyPracticeTransferSnapshot(sessionId: number, noteIds: number[]): PracticeTransferSnapshot {
	return { schemaVersion: SCHEMA_VERSION, sessionId, noteIds, transfer: { initialized: false, queue: [] } };
}
