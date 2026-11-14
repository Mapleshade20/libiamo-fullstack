/**
 * Whom the learner's latest group-chat message is for, when it quotes and @mentions nobody: one decision on the
 * learner's key (server/llm/decide.ts). Only Discord channels and iMessage groups need this: comment
 * threads always place a reply, mail has recipients, and one-to-one scenes have one counterpart.
 * The answer feeds the floor as `addressees`; null means "not inferred", and the floor falls back
 * to names in the text.
 */
import type { ExchangePlace } from "#lib/constants.ts";
import { resolveScene, type Scene } from "#lib/exchange/scene.ts";
import { buildSceneTranscript, type TranscriptEntry, type TranscriptMessage } from "#lib/server/exchange/prompt-context.ts";
import type { Caller } from "#lib/server/llm/caller.ts";
import { type Choice, decide, type Question } from "#lib/server/llm/decide.ts";

const WINDOW = 20;
const NOBODY = "nobody";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whether the learner's message being taken up leaves its addressee unsaid in a scene where it matters. */
export function needsAddressee(ui: ExchangePlace, scene: Scene, entries: TranscriptEntry[], target?: TranscriptEntry): boolean {
	const last = target ?? entries.at(-1);
	if (!scene.group || (ui !== "discord" && ui !== "imessage") || last?.role !== "learner" || last.replyTo) return false;
	return !scene.cast.some((person) => new RegExp(`@${escapeRegExp(person.name)}(?![\\p{L}\\p{N}_])`, "iu").test(last.text));
}

/** The Choice to ask: the chat so far as state, one option per person plus nobody in particular. */
export function buildAddresseeQuestion(ui: ExchangePlace, scene: Scene, entries: TranscriptEntry[], learnerName: string, target?: TranscriptEntry) {
	const last = target ?? entries[entries.length - 1];
	const earlier = entries.slice(-WINDOW - 1, -1);
	const shown = new Set(earlier.map((entry) => entry.id));
	const byId = new Map(entries.map((entry) => [entry.id, entry]));
	const people = [...new Set([...scene.cast.map((person) => person.name), ...earlier.map((entry) => entry.author)])].filter(
		(name) => name && name !== learnerName,
	);
	const state = {
		platform: ui === "discord" ? "Discord text channel" : "iMessage group chat",
		learner: learnerName,
		members_besides_learner: people,
		transcript: earlier.map((entry) => ({
			id: entry.id,
			author: entry.author,
			text: entry.text,
			...(entry.replyTo === undefined
				? {}
				: shown.has(entry.replyTo)
					? { reply_to: entry.replyTo }
					: { reply_to_earlier_message_by: byId.get(entry.replyTo)?.author }),
		})),
		latest_message: { id: last.id, author: learnerName, text: last.text, reply_quote: null, mentions: [] },
	};
	const who = `${learnerName}'s latest message (latest_message)`;
	const question: Question = {
		instructions: `Who is ${who} mainly aimed at? It has no reply quote and no @mention, so judge from the conversation: whose question it answers, whose remark it reacts to, who it calls by name.`,
		choices: {
			...Object.fromEntries(people.map((name, index) => [`p${index}`, `${name}: the message is mainly for ${name}.`])),
			[NOBODY]: "Nobody in particular: it is said to the whole chat, anyone may pick it up.",
		},
	};
	return { state, question, people };
}

/** The chosen person, or `[]` for nobody in particular. */
export function readAddressees(answer: Choice, people: string[]): string[] | null {
	if (answer.choice === NOBODY) return [];
	const name = people[Number(answer.choice.slice(1))];
	return name ? [name] : null;
}

export async function inferAddressees(input: {
	ai: Caller;
	setting: { id: string; ui: ExchangePlace; openingState: Record<string, unknown> | null };
	learnerName: string;
	history: TranscriptMessage[];
	/** The scene ref of the message being taken up; the latest learner message when absent. */
	targetRef?: string | null;
}): Promise<string[] | null> {
	try {
		const { setting: task, learnerName } = input;
		const scene = resolveScene(task.ui, task.openingState, task.id, learnerName);
		const { entries, refs } = buildSceneTranscript({ ui: task.ui, openingState: task.openingState, messages: input.history, learnerName, scene });
		const target = input.targetRef ? entries[refs.indexOf(input.targetRef)] : undefined;
		if (!needsAddressee(task.ui, scene, entries, target)) return null;
		const { state, question, people } = buildAddresseeQuestion(task.ui, scene, entries, learnerName, target);
		const answers = await decide(input.ai.for("exchange"), state, { question }, { tag: "exchange/addressee" });
		return answers.question ? readAddressees(answers.question, people) : null;
	} catch (error) {
		console.warn("Addressee inference failed:", error instanceof Error ? error.message : error);
		return null;
	}
}
