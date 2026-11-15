import type { ExchangePlace } from "#lib/constants.ts";
import type { Ao3Comment, RedditComment } from "#lib/exchange/opening.ts";

/*
 * The opening's comment trees as the editor edits them: one flat list where a reply follows its parent one level deeper
 * (adding a reply or removing a comment with its replies is a splice), nested again on save.
 */
export type FlatComment = { author: string; text: string; time?: string; depth: number };
type Threaded = Extract<ExchangePlace, "reddit" | "ao3">;
export const isThreaded = (place: string): place is Threaded => place === "reddit" || place === "ao3";

export function flattenComments(place: Threaded, list: unknown, depth = 0): FlatComment[] {
	if (!Array.isArray(list)) return [];
	return list.flatMap((c) =>
		place === "reddit"
			? [
					{ author: (c as RedditComment).author, text: (c as RedditComment).text, time: (c as RedditComment).timestamp, depth },
					...flattenComments(place, (c as RedditComment).replies, depth + 1),
				]
			: [
					{ author: (c as Ao3Comment).username, text: (c as Ao3Comment).comment, time: (c as Ao3Comment).timestamp, depth },
					...flattenComments(place, (c as Ao3Comment).replies, depth + 1),
				],
	);
}

export function nestComments(place: Threaded, flat: FlatComment[]): RedditComment[] | Ao3Comment[] {
	type Node = { c: FlatComment; replies: Node[] };
	const roots: Node[] = [];
	const stack: Node[] = [];
	for (const c of flat) {
		const node: Node = { c, replies: [] };
		const depth = Math.min(c.depth, stack.length);
		stack.length = depth;
		(depth ? stack[depth - 1].replies : roots).push(node);
		stack.push(node);
	}
	const out = (n: Node): RedditComment | Ao3Comment => {
		const time = n.c.time?.trim() ? { timestamp: n.c.time.trim() } : {};
		const replies = n.replies.length ? { replies: n.replies.map(out) } : {};
		return place === "reddit"
			? ({ author: n.c.author.trim(), text: n.c.text, ...time, ...replies } as RedditComment)
			: ({ username: n.c.author.trim(), comment: n.c.text, ...time, ...replies } as Ao3Comment);
	};
	return roots.map(out) as RedditComment[] | Ao3Comment[];
}

/** A reply goes right after its parent's last descendant, one level deeper. */
export function replyAt(list: FlatComment[], at: number) {
	const depth = list[at].depth + 1;
	let end = at + 1;
	while (end < list.length && list[end].depth >= depth) end++;
	list.splice(end, 0, { author: "", text: "", depth });
}

/** Removing a comment takes its replies with it. */
export function dropAt(list: FlatComment[], at: number) {
	const depth = list[at].depth;
	let end = at + 1;
	while (end < list.length && list[end].depth > depth) end++;
	list.splice(at, end - at);
}

/** A comma-separated list of tags, as one field. */
export const tagsText = (v: unknown) => (Array.isArray(v) ? v.join(", ") : "");
export const tagsOf = (s: string) =>
	s
		.split(",")
		.map((t) => t.trim())
		.filter(Boolean);
