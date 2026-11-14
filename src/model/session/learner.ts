import { z } from "zod";
import { aLearner, type Draft, LANG_NAMES } from "../fixtures/types.ts";
import { chatJson, type ModelKey } from "../llm.ts";

/** Everything the session asks of the learner. A human UI and the simulated learner implement the same interface. */
export interface Learner {
	/** `ui` is the question as a human learner sees it, in their language; `context` and `question` brief the simulation. */
	choose(context: string, question: string, options: string[], ui?: string): Promise<number>;
	/** Free text: their meaning, a question, or a correction. null = they decline. */
	say(context: string, question: string, ui?: string): Promise<string | null>;
	/** A rewrite attempt, or a request for a hint or the answer. */
	attempt(task: AttemptTask): Promise<{ text: string } | { hint: true } | { give: true }>;
}

export type AttemptTask = {
	post: string;
	original: string;
	reading: string;
	prompt: string;
	pieces: string[];
	rung?: string;
	history: { text: string; feedback: string }[];
};

/**
 * An LLM playing the writer: a learner of the target language who knows what they meant, makes the mistakes their draft
 * shows on a first try and improves with feedback, without suddenly writing like a native.
 */
export class SimulatedLearner implements Learner {
	private seq = 0;
	constructor(
		private d: Draft,
		private model: ModelKey = "luna",
		private sample = 0,
	) {}

	private persona() {
		const T = LANG_NAMES[this.d.target];
		const L = LANG_NAMES[this.d.learner];
		return `You are the writer of the draft below: ${aLearner(this.d)} of ${T} whose first language is ${L}. You wrote it to post on ${this.d.scene.platform}, and you know what you meant. You use an app that coaches you through revising it. Answer as yourself, briefly; when you write in your own words outside ${T}, use ${L}.

Your draft:
<<<
${this.d.text}
>>>
${this.d.background ? `Your note to the app: ${this.d.background}` : ""}`;
	}

	private async json<T>(user: string, schema: z.ZodType<T>, tag: string): Promise<T> {
		const r = await chatJson(
			[
				{ role: "system", content: this.persona() },
				{ role: "user", content: user },
			],
			schema,
			{ model: this.model, effort: "low", sample: this.sample * 1000 + this.seq++, tag: `learner/${tag}` },
		);
		return r.value;
	}

	async choose(context: string, question: string, options: string[]) {
		const r = await this.json(
			`${context}\n\n${question}\n${options.map((o, i) => `${i + 1}. ${o}`).join("\n")}\n\nPick the option that is true for you. Reply with JSON only: {"choice": number}`,
			z.object({ choice: z.number() }),
			"choose",
		);
		return Math.min(Math.max(1, r.choice), options.length) - 1;
	}

	async say(context: string, question: string) {
		const r = await this.json(
			`${context}\n\n${question}\n\nReply with JSON only: {"text": "what you type, or null if you would not type anything"}`,
			z.object({ text: z.string().nullable() }),
			"say",
		);
		return r.text?.trim() || null;
	}

	async attempt(t: AttemptTask) {
		const T = LANG_NAMES[this.d.target];
		const user = `You are revising this part of your post: "${t.original}"
What you mean there (you confirmed it): ${t.reading}
The tutor says: ${t.prompt}
Hint words: ${t.pieces.join(" · ")}${t.rung ? `\nHint sentence: ${t.rung}` : ""}
${t.history.length ? `Your tries so far and the feedback:\n${t.history.map((h, i) => `${i + 1}. "${h.text}" → ${h.feedback}`).join("\n")}` : "This is your first try."}

The post right now:
<<<
${t.post}
>>>

Write your new version of that part in ${T}: only that part (or the sentence it sits in, if you need to rebuild it), saying what you meant there and nothing new; do not add points, details or opinions your draft did not have. Write it the way you really would at your level: on a first try you make the kinds of mistakes your draft shows (tense, structures carried over from your own language, dictionary-meaning word choices); after feedback you fix what you were told, and sometimes still miss something. Do not write like a native speaker. If you are stuck after two or more tries you may ask for a hint ("hint") or for the answer ("give").
Reply with JSON only: {"action": "write" | "hint" | "give", "text": "your version, when writing"}`;
		const r = await this.json(user, z.object({ action: z.enum(["write", "hint", "give"]), text: z.string().nullable().optional() }), "attempt");
		if (r.action === "hint") return { hint: true as const };
		if (r.action === "give" || !r.text) return { give: true as const };
		return { text: r.text };
	}
}
