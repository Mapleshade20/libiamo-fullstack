import { keepCollected, sandboxed } from "#lib/components/tour/sandbox.svelte.ts";
import { answered, needKey, stopOf } from "#lib/llm/stops.ts";
import { removeNotes } from "#lib/notebook/notebook.remote.ts";

/*
 * Phrases kept from something read, wherever it is read (a scenario's situation, later the session's context): each
 * highlight is filled in by the collect call (meaning, register, why) and the server keeps it in the notebook the moment
 * it is, each text as the reading its phrases come from. A mark undone or changed takes its entry away. One collector
 * per page; highlightable texts register their marks with it. The /collect page keeps its own (it also holds the
 * follow-up questions).
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
	/** The notebook entry it is kept as. */
	id?: string;
};
type Setup = { lang: string; native: string; feedback: string; place?: string };

export class Collector {
	kept = $state<Kept[]>([]);
	private batch = `${Date.now()}`;
	private timers = new Map<string, ReturnType<typeof setTimeout>>();
	private retries = 0;
	/** Each text's reading, once its first phrase is kept. */
	private readings = new Map<string, string>();
	constructor(private setup: Setup) {}
	private forget(ids: (string | undefined)[]) {
		const gone = ids.filter((x): x is string => !!x);
		if (gone.length && !sandboxed()) removeNotes(gone).catch(() => {});
	}

	/** A mark in a text was made or changed; filled in a moment later, with the other new marks in the same text. */
	mark(block: string, passage: string, key: string, marked: string, sentence: string) {
		const at = this.kept.findIndex((k) => k.key === key);
		const item: Kept = { key, marked, sentence };
		if (at >= 0) this.forget([this.kept[at].id]);
		if (at >= 0) this.kept[at] = item;
		else this.kept.push(item);
		clearTimeout(this.timers.get(block));
		this.timers.set(
			block,
			setTimeout(() => this.fill(block, passage), 900),
		);
	}
	unmark(key: string) {
		this.forget(this.kept.filter((k) => k.key === key).map((k) => k.id));
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
		const sent = todo.map((k, i) => ({ n: i + 1, text: k.marked, key: k.key, sentence: k.sentence }));
		try {
			needKey();
			this.halt = null;
			const r = await fetch("/api/collect/explain", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					...this.setup,
					passage,
					readingId: this.readings.get(block),
					highlights: sent.map(({ n, text, sentence }) => ({ n, text, sentence })),
					retry: this.retries,
				}),
			});
			await answered(r);
			const { items, readingId } = (await r.json()) as {
				readingId?: string;
				items: { n: number; id?: string; phrase: string; meaning: string; register: string; why: string; example: string }[];
			};
			if (readingId) this.readings.set(block, readingId);
			const stale: (string | undefined)[] = [];
			for (const s of sent) {
				const k = this.kept.find((x) => x.key === s.key);
				const it = items.find((x) => x.n === s.n);
				// Changed or undone while the call was out: the next call fills it, and this one's entry goes.
				if (!k || k.marked !== s.text) {
					stale.push(it?.id);
					continue;
				}
				if (it)
					Object.assign(k, {
						id: it.id,
						phrase: it.phrase,
						meaning: it.meaning,
						register: it.register,
						why: it.why,
						example: it.example,
						failed: false,
					});
				else k.failed = true;
			}
			this.forget(stale);
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
	/** The tour's phrases go to its sandbox (the server kept the learner's as they were filled in). */
	private store() {
		if (!sandboxed()) return;
		keepCollected(
			this.batch,
			this.kept
				.filter((k) => k.phrase)
				.map((k) => ({
					lang: this.setup.lang,
					phrase: k.phrase as string,
					meaning: k.meaning ?? "",
					why: k.why,
					register: k.register,
					example: k.example,
					marked: k.marked,
					sentence: k.sentence,
				})),
		);
	}
}
