import { learner } from "#lib/server/guard.ts";
import { learnerCaller } from "#lib/server/llm/callers.ts";
import { gate } from "#lib/server/writing/gate.ts";

// The composer's door (server/writing/gate.ts): is this something to work on, and in which language? On the learner's
// own key, like every call they make.
export async function POST({ request }) {
	const u = learner();
	const b = await request.json();
	const strs = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
	return Response.json(
		await gate(
			{
				mode: b.mode === "collect" ? "collect" : "check",
				text: String(b.text ?? ""),
				native: String(b.native ?? "en"),
				learning: strs(b.learning),
				active: String(b.active ?? "en"),
			},
			await learnerCaller({ user: u }),
		),
	);
}
