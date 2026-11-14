import { CALLS } from "$lib/components/debug/calls";
import { read, write } from "$lib/demo/app.svelte";
import { COLLECTED_KEY } from "$lib/demo/data";
import { checkCall, stopOf } from "$lib/demo/limits";

/*
 * Phrases kept from something read, wherever it is read (a scenario's situation, later the session's context): each
 * highlight is filled in by the collect call (meaning, register, why) and kept in the notebook the moment it is. One
 * collector per page; highlightable texts register their marks with it. The /collect page keeps its own (it also holds
 * the follow-up questions).
 */
export type Kept = {
	key: string;
	marked: string;
	sentence: string;
	phrase?: string;
	meaning?: string;
	register?: string;
	why?: string;
	example?: string;
	failed?: boolean;
};
type Setup = { lang: string; native: string; feedback: string; model: string };

export class Collector {
	kept = $state<Kept[]>([]);
	private batch = `${Date.now()}`;
	private timers = new Map<string, ReturnType<typeof setTimeout>>();
	private retries = 0;
	constructor(private setup: Setup) {}

	/** A mark in a text was made or changed; filled in a moment later, with the other new marks in the same text. */
	mark(block: string, passage: string, key: string, marked: string, sentence: string) {
		const at = this.kept.findIndex((k) => k.key === key);
		const item: Kept = { key, marked, sentence };
		if (at >= 0) this.kept[at] = item;
		else this.kept.push(item);
		clearTimeout(this.timers.get(block));
		this.timers.set(
			block,
			setTimeout(() => this.fill(block, passage), 900),
		);
	}
	unmark(key: string) {
		this.kept = this.kept.filter((k) => k.key !== key);
		this.store();
	}
	/** No key, or one the provider refused, stopped the phrases from being filled in: the page says so, with the way on. */
	halt = $state<{ kind: "nokey" | "refused"; retry: () => void } | null>(null);
	retry(block: string, passage: string) {
		this.halt = null;
		this.retries++;
		for (const k of this.kept) if (k.key.startsWith(`${block}:`)) k.failed = false;
		this.fill(block, passage);
	}
	private async fill(block: string, passage: string) {
		const todo = this.kept.filter((k) => k.key.startsWith(`${block}:`) && !k.phrase);
		if (!todo.length) return;
		const sent = todo.map((k, i) => ({ n: i + 1, text: k.marked, key: k.key }));
		try {
			checkCall(`explain:${sent.map((x) => x.text).join("|")}`);
			this.halt = null;
			const r = await CALLS.traced("/api/collect/explain", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ ...this.setup, passage, highlights: sent.map(({ n, text }) => ({ n, text })), retry: this.retries }),
			});
			if (!r.ok) throw new Error(String(r.status));
			const { items } = (await r.json()) as {
				items: { n: number; phrase: string; meaning: string; register: string; why: string; example: string }[];
			};
			for (const s of sent) {
				const k = this.kept.find((x) => x.key === s.key);
				// Changed while the call was out: the next call fills it.
				if (!k || k.marked !== s.text) continue;
				const it = items.find((x) => x.n === s.n);
				if (it) Object.assign(k, { phrase: it.phrase, meaning: it.meaning, register: it.register, why: it.why, example: it.example, failed: false });
				else k.failed = true;
			}
		} catch (e) {
			const k = stopOf(e);
			if (k !== "error") this.halt = { kind: k, retry: () => this.retry(block, passage) };
			for (const s of sent) {
				const k = this.kept.find((x) => x.key === s.key);
				if (k) k.failed = true;
			}
		}
		this.store();
	}
	private store() {
		const others = read<{ batch?: string }[]>(COLLECTED_KEY, []).filter((x) => x.batch !== this.batch);
		write(COLLECTED_KEY, [
			...others,
			...this.kept
				.filter((k) => k.phrase)
				.map((k) => ({
					batch: this.batch,
					lang: this.setup.lang,
					phrase: k.phrase,
					meaning: k.meaning,
					why: k.why,
					register: k.register,
					example: k.example,
					marked: k.marked,
					sentence: k.sentence,
					at: Date.now(),
				})),
		]);
	}
}
