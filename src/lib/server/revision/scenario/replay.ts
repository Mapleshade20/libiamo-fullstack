// After a scenario's revision: the person who answered a turn answers its revised version (user, 2026-11-07: fine in a
// simulation, where nobody real is waiting, unlike a pre-send rehearsal of a real post). They react as themselves to
// the new words, knowing only what came before; their first reply is shown to them so the difference is honest, not
// flattering.

import { type Caller, chat } from "#lib/server/llm/caller.ts";
import type { Draft } from "#lib/server/revision/draft.ts";
import { LANG_NAMES } from "#lib/server/revision/draft.ts";
import { type Case, exchange, replyTo, turns } from "#lib/server/revision/scenario/exchange.ts";

export async function replayReply(c: Case, n: number, revised: string, d: Draft, ai: Caller) {
	const first = replyTo(c, n);
	if (!first) return null;
	const T = LANG_NAMES[d.target];
	const was = turns(c)[n - 1]?.text ?? "";
	const system = `You are ${first.author} on ${c.scene.platform} (${c.scene.where}). You write ${T} the way you always do here.`;
	const user = [
		"The conversation so far:",
		"<<<",
		exchange(c, { upTo: n - 1 }),
		">>>",
		"",
		"Then the writer sent this:",
		"<<<",
		revised,
		">>>",
		"",
		`(In another version of this moment they had written:\n"""${was}"""\nand you answered:\n"""${first.text}""")`,
		"",
		`Reply to the message they sent, as yourself: the same person, mood and style as your other answer, and no longer than it (count the sentences). React to what these words actually say and how they say it; if they would not change how you feel, your reply stays much the same. Never comment on their English. Reply with your message only.`,
	].join("\n");
	const r = await chat(
		[
			{ role: "system", content: system },
			{ role: "user", content: user },
		],
		{ ai, effort: "low", tag: "scenario/replay" },
	);
	return { author: first.author, text: r.text.trim().replace(/^"|"$/g, ""), before: first.text };
}
