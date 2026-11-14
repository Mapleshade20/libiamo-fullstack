/**
 * Context a writer imports: anything copied from elsewhere, as opposed to the note they write themselves. A capture
 * script's copy (the app's capture format, see libiamo-fullstack `lib/admin/capture.ts`; the AO3 script here also takes
 * the work's full text) or Reddit's own JSON is read for its structure (who wrote what, what answers what); any other
 * text is kept as it is. One call reads it into a brief for the session (calls.ts `briefFor`); only the calls that
 * answer the writer read the import itself.
 */

import { words as segment } from "../words.ts";

export type SourceMessage = { id: string; parent: string | null; author: string; text: string; time?: string };
export type Source = {
	platform: "ao3" | "reddit" | "discord" | "text";
	/** One line saying what it is, for the setup panel and the scene call. */
	label: string;
	/** The work, the post or the channel, before the messages. */
	head: string;
	messages: SourceMessage[];
};

type Obj = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const list = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const isoTime = (seconds: unknown) => (typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : undefined);

function fromRedditListing(value: unknown): Source | null {
	if (!Array.isArray(value) || (value[0] as Obj)?.kind !== "Listing") return null;
	const post = ((value[0] as { data?: { children?: { data?: Obj }[] } }).data?.children?.[0]?.data ?? null) as Obj | null;
	if (!post) return null;
	const messages: SourceMessage[] = [];
	type Thing = { kind: string; data: Obj & { replies?: { data?: { children?: Thing[] } } } };
	const walk = (things: Thing[] = []) => {
		for (const { kind, data } of things) {
			if (kind !== "t1") continue;
			const body = str(data.body);
			if (data.author !== "[deleted]" && data.author !== "AutoModerator" && body !== "[removed]" && body !== "[deleted]") {
				const parent = str(data.parent_id);
				messages.push({
					id: str(data.name),
					parent: parent.startsWith("t1_") ? parent : null,
					author: str(data.author),
					text: body,
					time: isoTime(data.created_utc),
				});
			}
			walk(data.replies?.data?.children);
		}
	};
	walk((value[1] as { data?: { children?: Thing[] } })?.data?.children);
	return {
		platform: "reddit",
		label: `r/${str(post.subreddit)} · ${str(post.title)}`,
		head: `Reddit post in r/${str(post.subreddit)} by u/${str(post.author)}\nTitle: ${str(post.title)}\n\n${str(post.selftext)}`,
		messages: messages.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "")),
	};
}

function fromCapture(value: unknown): Source | null {
	if (!value || typeof value !== "object") return null;
	const v = value as Obj;
	const messages = (Array.isArray(v.messages) ? v.messages : [])
		.map((m: Obj) => ({
			id: str(m.id),
			parent: m.parent ? str(m.parent) : null,
			author: str(m.author),
			text: str(m.text),
			time: m.time ? str(m.time) : undefined,
		}))
		.filter((m) => m.text);
	if (v.platform === "ao3" && v.work && typeof v.work === "object") {
		const w = v.work as Obj;
		const tags = (name: string, key: string) => (list(w[key]).length ? `${name}: ${list(w[key]).join(", ")}` : "");
		const head = [
			`AO3 work: ${str(w.title)}${w.author ? ` by ${str(w.author)}` : ""}${w.chapter ? ` (chapter: ${str(w.chapter)})` : ""}`,
			tags("Fandom", "fandoms"),
			tags("Relationships", "relationships"),
			tags("Characters", "characters"),
			tags("Tags", "additionalTags"),
			w.summary ? `Summary: ${str(w.summary)}` : "",
			w.notes ? `Author's notes:\n${str(w.notes)}` : "",
			// The full text when the script took it; the app's own script takes an excerpt.
			w.body ? `\n=== The work ===\n\n${str(w.body)}` : w.excerpt ? `\nOpening of the chapter:\n${str(w.excerpt)}` : "",
		]
			.filter(Boolean)
			.join("\n");
		return { platform: "ao3", label: `AO3 · ${str(w.title)}`, head, messages };
	}
	if (v.platform === "reddit" && v.post && typeof v.post === "object") {
		const p = v.post as Obj;
		return {
			platform: "reddit",
			label: `r/${str(p.subreddit)} · ${str(p.title)}`,
			head: `Reddit post in r/${str(p.subreddit)} by u/${str(p.author)}\nTitle: ${str(p.title)}\n\n${str(p.body)}`,
			messages,
		};
	}
	if (v.platform === "discord")
		return {
			platform: "discord",
			label: `Discord · ${str(v.serverName)} #${str(v.channelName)}`,
			head: `Discord server ${str(v.serverName)}, channel #${str(v.channelName)}`,
			messages,
		};
	return null;
}

/**
 * What a capture copied, without anything typed around it by accident: from the first bracket to the last. Null when
 * the input does not look like JSON at all.
 */
export function jsonPart(input: string): string | null {
	const raw = input.trim();
	// It opens like JSON (an object, or Reddit's list of objects) within a stray character or two; "[10:42] alice"
	// and prose with a bracket in it are text.
	const from = raw.search(/\{\s*"|\[\s*\{/);
	if (from < 0 || from > 3) return null;
	// The end is cut at the last closing bracket near it; a capture cut short keeps its end and will not parse.
	const to = raw.lastIndexOf(raw[from] === "[" ? "]" : "}");
	return to > from && raw.length - 1 - to <= 3 ? raw.slice(from, to + 1) : raw.slice(from);
}

/** Whether pasted context is a capture, text to keep as it is, or a capture that does not read (a broken copy). */
export function sourceKind(input: string): "capture" | "text" | "broken" | "empty" {
	if (!input.trim()) return "empty";
	if (parseSource(input)) return "capture";
	return jsonPart(input) ? "broken" : "text";
}

/** A capture or Reddit's JSON; null for anything else. */
export function parseSource(input: string): Source | null {
	const raw = jsonPart(input);
	if (raw) {
		try {
			const value = JSON.parse(raw);
			const s = fromRedditListing(value) ?? fromCapture(value);
			if (s) {
				// A reply whose parent was not captured stands at the top level.
				const ids = new Set(s.messages.map((m) => m.id));
				for (const m of s.messages) if (m.parent && !ids.has(m.parent)) m.parent = null;
				return s;
			}
		} catch {
			// Not JSON.
		}
	}
	return null;
}

const words = (t: string) => new Set(segment(t).map((x) => x.w));
/** How much of the draft a message repeats: its words found in the message, over the draft's words. */
function overlap(draft: Set<string>, text: string) {
	if (!draft.size) return 0;
	const w = words(text);
	let n = 0;
	for (const x of draft) if (w.has(x)) n++;
	return n / draft.size;
}

/** Pasted text that is not a capture, as it is. */
export function plainSource(input: string): Source {
	return { platform: "text", label: "Pasted text", head: input.trim(), messages: [] };
}

/**
 * The writer's own draft, when it is already posted on the page (an edit, or a capture taken after posting), is not
 * context: it and the replies under it would tell the session what to keep. Both go.
 */
export function withoutDraft(s: Source, draft: string): Source {
	const d = words(draft);
	// Most of the draft is in it, and it is not much longer than the draft (a long message quoting it is someone else's).
	const isDraft = (text: string) => overlap(d, text) >= 0.6 && words(text).size <= d.size * 1.6 + 5;
	// Pasted text has no messages; its paragraphs that are the draft go (replies to it cannot be told apart).
	if (s.platform === "text")
		return {
			...s,
			head: s.head
				.split(/\n\s*\n/)
				.filter((p) => !isDraft(p))
				.join("\n\n"),
		};
	const own = s.messages.filter((m) => isDraft(m.text));
	const gone = new Set(own.map((m) => m.id));
	for (const m of s.messages) if (m.parent && gone.has(m.parent)) gone.add(m.id);
	return { ...s, messages: s.messages.filter((m) => !gone.has(m.id)) };
}

/** The import as the brief call reads it: the head, then every message in page order, naming what each answers. */
export function renderSource(s: Source): string {
	const byId = new Map(s.messages.map((m) => [m.id, m]));
	const kind = s.platform === "discord" ? "Messages" : "Comments";
	const lines = s.messages.map((m) => {
		const parent = m.parent ? byId.get(m.parent) : undefined;
		return `[${m.id}] ${m.author}${parent ? ` (replying to ${parent.author} [${parent.id}])` : ""}: ${m.text}`;
	});
	if (!lines.length) return s.head;
	return `${s.head}\n\n=== ${kind}, oldest first ===\n\n${lines.join("\n\n")}`;
}

/** A short head for the scene call, which only needs to know where the draft goes. */
export const sourceGist = (s: Source) => s.head.split("\n=== The work ===")[0].slice(0, 1200);
