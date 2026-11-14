import { and, desc, eq, inArray } from "drizzle-orm";
import { situationOf } from "#lib/exchange/opening.ts";
import { resolveScene } from "#lib/exchange/scene.ts";
import { situationText } from "#lib/scenario/situation.ts";
import { SITE_OF } from "#lib/scenario/types.ts";
import type { Exchange, ExMsg } from "#lib/session/types.ts";
import { SEP } from "#lib/session/types.ts";
import { db } from "../db/index.ts";
import { exchange, piece, scenario } from "../db/schema.ts";
import { sessionMessageChronologicalOrder } from "./exchanges.ts";
import { buildSceneTranscript } from "./prompt-context.ts";
import { type Setting, settingFrom } from "./setting.ts";

/*
 * Out of the place: the exchange as the after page shows it (what the learner sent and how the others took it, the
 * opening left out) and as the revision reads it (the lab's `Exchange`: the scene, what was there before, the
 * conversation), with the learner's turns as the piece's text.
 */
export type ThreadTurn = { author: string; text: string; me: boolean };
export type AfterView = {
	scenarioId: string;
	pieceId: string;
	exchangeId: number;
	/** The newest reply, marked read once the page shows the thread. */
	latestReplyId: number | null;
	title: string;
	site: string;
	place: Setting["ui"];
	language: string;
	/** Still being played: the after page sends the learner back to the place. */
	open: boolean;
	thread: ThreadTurn[];
	handoff: { text: string; exchange: Exchange; background: string; source: string; scenario: { id: string; title: string; site: string } };
};

const LAB_PLACE: Record<Setting["ui"], Exchange["place"]> = { ao3: "ao3", reddit: "reddit", email: "mail", discord: "discord", imessage: "imessage" };

/** Where the scene is, as the revision names it. */
function whereOf(s: Setting): string {
	const sit = situationOf(s.ui, s.version.opening, s.version.people[0]?.name);
	if (!sit) return SITE_OF[s.ui];
	if (sit.kind === "reddit") return `r/${sit.sub}`;
	if (sit.kind === "ao3") return `“${sit.work}”, ${sit.chapter}`;
	if (sit.kind === "email") return `email: ${sit.subject}`;
	if (sit.kind === "chat") return sit.place;
	return SITE_OF[s.ui];
}

export async function afterOf(u: { id: string; name: string }, scenarioId: string): Promise<AfterView | null> {
	const [row] = await db
		.select({
			exchangeId: exchange.id,
			status: exchange.status,
			pieceId: piece.id,
			language: piece.language,
			background: piece.background,
			s: scenario,
		})
		.from(exchange)
		.innerJoin(piece, eq(piece.id, exchange.pieceId))
		.innerJoin(scenario, eq(scenario.id, exchange.scenarioId))
		.where(and(eq(exchange.userId, u.id), eq(exchange.scenarioId, scenarioId), inArray(piece.state, ["writing", "revising"])))
		.orderBy(desc(exchange.startedAt))
		.limit(1);
	if (!row) return null;
	const s = settingFrom(row.s, row.language);
	if (!s) return null;
	const learnerName = u.name || "Learner";
	const messages = await db.query.exchange.findFirst({
		where: eq(exchange.id, row.exchangeId),
		with: { messages: { orderBy: sessionMessageChronologicalOrder } },
	});
	const scene = resolveScene(s.ui, s.openingState, s.id, learnerName);
	const { entries } = buildSceneTranscript({ ui: s.ui, openingState: s.openingState, messages: messages?.messages ?? [], learnerName, scene });

	// What was there before the learner arrived: the post or the chapter itself on a thread, then the opening messages.
	const sit = situationOf(s.ui, s.version.opening, s.version.people[0]?.name);
	const head: ExMsg[] =
		sit?.kind === "reddit"
			? [{ id: "b0", author: sit.author, text: `${sit.title}\n\n${sit.body}` }]
			: sit?.kind === "ao3"
				? [{ id: "b0", author: sit.author, text: `${sit.excerpt}${sit.note ? `\n\nAuthor's note: ${sit.note}` : ""}` }]
				: [];
	const threaded = head.length > 0;
	const msg = (e: (typeof entries)[number]): ExMsg => ({
		id: String(e.id),
		author: e.author,
		text: e.text,
		...(e.replyTo !== undefined && e.replyTo !== null ? { replyTo: String(e.replyTo) } : threaded ? { replyTo: "b0" } : {}),
		...(e.role === "learner" ? { learner: true } : {}),
	});
	const before = [...head, ...entries.filter((e) => e.opening).map(msg)];
	const transcript = entries.filter((e) => !e.opening).map(msg);
	const ex: Exchange = {
		place: LAB_PLACE[s.ui],
		lang: s.language,
		scene: {
			platform: SITE_OF[s.ui],
			where: whereOf(s),
			you: s.version.you,
			goals: s.version.goals,
			cast: s.version.people.map(({ name, who }) => ({ name, who })),
		},
		before,
		transcript,
	};

	// The thread as the after page shows it: a learner's messages in a row read as one turn.
	const thread: ThreadTurn[] = [];
	for (const e of transcript) {
		const me = !!e.learner;
		const last = thread.at(-1);
		if (me && last?.me) last.text += `\n${e.text}`;
		else thread.push({ author: e.author, text: e.text, me });
	}
	const text = transcript
		.filter((m) => m.learner)
		.map((m) => m.text)
		.join(`\n\n${SEP}\n\n`);
	const conversation = transcript.map((m) => `${m.learner ? learnerName : m.author}: ${m.text}`).join("\n");
	const background = [s.version.introduction, row.background && `My plan: ${row.background}`].filter(Boolean).join("\n\n");
	return {
		scenarioId,
		pieceId: row.pieceId,
		exchangeId: row.exchangeId,
		latestReplyId: (messages?.messages ?? []).reduce((m, x) => (x.role === "assistant" ? Math.max(m, x.id) : m), 0) || null,
		title: s.title,
		site: SITE_OF[s.ui],
		place: s.ui,
		language: s.language,
		open: row.status === "in_progress",
		thread,
		handoff: {
			text,
			exchange: ex,
			background,
			source: `${sit ? situationText(sit) : ""}\n\nThe conversation:\n${conversation}`,
			scenario: { id: scenarioId, title: s.title, site: SITE_OF[s.ui] },
		},
	};
}
