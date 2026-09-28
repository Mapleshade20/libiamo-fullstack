/**
 * Real conversations as Scene Lab scenarios. A captured thread or channel log (kept out of the
 * repository, in tmp/scene-refs) becomes an opening, a learner played by one real participant who
 * repeats their real lines, and the real continuation to read beside the simulated ones.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildOpening, type Capture, type CapturedMessage, LEARNER_SEAT, renderMessages } from "$lib/admin/capture";

export const REFERENCES_DIR = join(process.cwd(), "tmp", "scene-refs");

export type ReferenceSpec = {
	file: string;
	kind: "reddit" | "ao3" | "chat";
	/** The real participant the simulated learner plays. */
	learner: string;
	title: string;
	objective: string;
	/** What an author would write as character notes for this place. */
	notes: string;
	serverName?: string;
	channelName?: string;
};

/** A line the real learner wrote, and what it answered. */
export type ScriptLine = { text: string; answering?: { author: string; text: string } };

const OPENING = { min: 12, max: 20 };
const SCRIPT_LINES = 5;
const CONTINUATION = 45;

/** The captures in tmp/scene-refs predate the capture format; each kind has its own shape. */
function toCapture(spec: ReferenceSpec, raw: Record<string, unknown> & Array<Record<string, unknown>>): Capture {
	if (spec.kind === "reddit") {
		const post = raw.post as Record<string, string & number>;
		return {
			platform: "reddit",
			post: { title: post.title, body: post.body, subreddit: String(post.subreddit).replace(/^r\//, ""), author: post.author },
			messages: (raw.comments as Array<Record<string, string & number>>).map((comment) => ({
				id: comment.id,
				parent: String(comment.parent ?? "").startsWith("t1_") ? comment.parent : null,
				author: comment.author,
				text: comment.text,
			})),
		};
	}
	if (spec.kind === "ao3")
		return {
			platform: "ao3",
			work: raw.work as Extract<Capture, { platform: "ao3" }>["work"],
			messages: raw.comments as CapturedMessage[],
		};
	// Channel logs quote by author: a quoted reply points at the latest earlier message of that author.
	const log = raw as unknown as Array<{ author: string; text: string; reply?: { author: string } | null }>;
	return {
		platform: "discord",
		serverName: spec.serverName ?? "",
		channelName: spec.channelName ?? "",
		messages: log.map((message, index) => {
			const quoted = message.reply ? log.slice(0, index).findLastIndex((earlier) => earlier.author === message.reply?.author) : -1;
			return { id: String(index), parent: quoted >= 0 ? String(quoted) : null, author: message.author, text: message.text };
		}),
	};
}

/** The opening ends where the learner first speaks, but never before `OPENING.min` messages. */
function cut(messages: CapturedMessage[], learner: string) {
	const first = messages.findIndex((message) => message.author === learner);
	const end = Math.min(Math.max(first, OPENING.min), OPENING.max);
	const dropped = new Set<string>();
	const opening = messages.slice(0, end).filter((message) => {
		if (message.author !== learner && !(message.parent && dropped.has(message.parent))) return true;
		dropped.add(message.id);
		return false;
	});
	const byId = new Map(messages.map((message) => [message.id, message]));
	const script: ScriptLine[] = messages
		.slice(end)
		.filter((message) => message.author === learner)
		.slice(0, SCRIPT_LINES)
		.map((message) => {
			const target = message.parent ? byId.get(message.parent) : undefined;
			return { text: message.text, ...(target ? { answering: { author: target.author, text: target.text } } : {}) };
		});
	return { opening, script, rest: messages.slice(end, end + CONTINUATION) };
}

export async function loadReference(spec: ReferenceSpec) {
	const capture = toCapture(spec, JSON.parse(await readFile(join(REFERENCES_DIR, spec.file), "utf8")));
	const header =
		capture.platform === "reddit"
			? `r/${capture.post.subreddit} · ${capture.post.author}: ${capture.post.title}\n${capture.post.body}`
			: capture.platform === "ao3"
				? `AO3 · ${capture.work.title} by ${capture.work.author}\n${capture.work.summary}`
				: `Discord · ${capture.serverName} #${capture.channelName}`;
	const { opening, script, rest } = cut(capture.messages, spec.learner);
	return {
		learnerName: spec.learner,
		script,
		task: {
			title: spec.title,
			language: "en",
			ui: capture.platform,
			shortObjective: spec.objective,
			description: spec.objective,
			difficulty: 3,
			agentPrompt: spec.notes,
			openingState: buildOpening(capture, opening),
		},
		// How it really went on, the learner's seat anonymised: the cast's background when a variant gives it.
		source: { continuation: renderMessages(capture, rest, spec.learner) },
		referenceText: `${header}\n\n## Opening (what every version starts from)\n${renderMessages(capture, opening)}\n\n## What the real people wrote next (${LEARNER_SEAT} is ${spec.learner})\n${renderMessages(capture, rest, spec.learner)}`,
	};
}
