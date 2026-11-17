/*
 * What a learner is still typing and has not sent stays on this device (a learner comes back to the same thing on the
 * same device; the server is told only when it is sent): the translation sheet, the plan on a scenario's page, a mail
 * in the email place. One store for all of them, so they cannot pile up: a draft untouched for thirty days goes, at
 * most twenty are kept (the oldest go first), and signing out empties it. The home page's draft is kept on its own
 * (lib/writing/draft.ts) and goes with it on signing out.
 */
const KEY = "drafts";
export const DRAFT_DAYS = 30;
export const DRAFT_LIMIT = 20;

export type DraftKind = "sheet" | "plan" | "mail";
type Entry = { text: string; at: number };
type Store = Record<string, Entry>;

const id = (kind: DraftKind, key: string) => `${kind}:${key}`;

function read(): Store {
	try {
		const v = JSON.parse(localStorage.getItem(KEY) ?? "{}");
		return v && typeof v === "object" ? (v as Store) : {};
	} catch {
		return {};
	}
}

/** The store without what is too old, and no more than the newest `DRAFT_LIMIT`. */
export function trimDrafts(store: Store, now = Date.now()): Store {
	const fresh = Object.entries(store).filter(([, e]) => typeof e?.text === "string" && now - e.at < DRAFT_DAYS * 86_400_000);
	return Object.fromEntries(fresh.sort(([, a], [, b]) => b.at - a.at).slice(0, DRAFT_LIMIT));
}

function write(store: Store) {
	try {
		const kept = trimDrafts(store);
		if (Object.keys(kept).length) localStorage.setItem(KEY, JSON.stringify(kept));
		else localStorage.removeItem(KEY);
	} catch {
		// Storage can be unavailable (private mode, full): the draft then lives while the page is open.
	}
}

/** A draft kept on this device, or "" (none, or too old). */
export function localDraft(kind: DraftKind, key: string): string {
	return trimDrafts(read())[id(kind, key)]?.text ?? "";
}

/** Keeps what is typed; an empty draft is dropped. */
export function keepLocalDraft(kind: DraftKind, key: string, text: string) {
	const store = read();
	if (text.trim()) store[id(kind, key)] = { text, at: Date.now() };
	else delete store[id(kind, key)];
	write(store);
}

/** Drops a draft once what it held is sent. */
export function dropLocalDraft(kind: DraftKind, key: string) {
	const store = read();
	delete store[id(kind, key)];
	write(store);
}

/** Every draft on this device goes (signing out: the next person here must not find them). */
export function dropAllDrafts() {
	try {
		localStorage.removeItem(KEY);
	} catch {
		// Nothing kept.
	}
}
