/* What a pasted context will be read as, said the moment it is pasted (src/context/source.ts decides the same on the
   server): a capture from one of the scripts, plain text, or a capture that no longer reads. */
const WORDS = new Intl.Segmenter(undefined, { granularity: "word" });
const wordCount = (t: string) => [...WORDS.segment(t)].filter((x) => x.isWordLike).length;
// A capture is JSON; up to three stray characters around it are forgiven.
function jsonPart(raw: string) {
	const from = raw.search(/\{\s*"|\[\s*\{/);
	if (from < 0 || from > 3) return null;
	const to = raw.lastIndexOf(raw[from] === "[" ? "]" : "}");
	return to > from && raw.length - 1 - to <= 3 ? raw.slice(from, to + 1) : raw.slice(from);
}
export type SourceStatus = { kind: "empty" | "text" | "capture" | "broken"; line: string };
type Tx = (key: string, vars?: Record<string, string | number>) => string;
export function sourceStatus(raw: string | undefined, tx: Tx): SourceStatus {
	const text = (raw ?? "").trim();
	if (!text) return { kind: "empty", line: "" };
	const about = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n));
	const part = jsonPart(text);
	if (!part) return { kind: "text", line: tx("srcText", { w: about(wordCount(text)) }) };
	try {
		const v = JSON.parse(part);
		const found = (what: string, n: number, w: number): SourceStatus => ({ kind: "capture", line: tx("srcFound", { what, n, w: about(w) }) });
		if (Array.isArray(v) && v[0]?.kind === "Listing") {
			const post = v[0].data.children[0].data;
			return found(`r/${post.subreddit}`, v[1]?.data?.children?.length ?? 0, wordCount(post.selftext ?? ""));
		}
		if (v?.platform === "ao3" && v.work)
			return found(`AO3 · ${v.work.title ?? ""}`, v.messages?.length ?? 0, wordCount(v.work.body ?? v.work.excerpt ?? ""));
		if (v?.platform === "reddit" && v.post) return found(`r/${v.post.subreddit ?? ""}`, v.messages?.length ?? 0, wordCount(v.post.body ?? ""));
		if (v?.platform === "discord")
			return found(`#${v.channelName ?? ""}`, v.messages?.length ?? 0, wordCount((v.messages ?? []).map((m: { text: string }) => m.text).join(" ")));
	} catch {
		// A capture cut short or with something typed into it.
	}
	return { kind: "broken", line: tx("srcBroken") };
}
