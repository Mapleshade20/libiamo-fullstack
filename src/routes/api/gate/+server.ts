import { learner } from "#lib/server/guard.ts";
import { serviceKey } from "#lib/server/llm/callers.ts";
import { recorder } from "#lib/server/llm/records.ts";
import { gate } from "#model/gate.ts";

// The composer's door (src/model/gate.ts): is this something to work on, and in which language? The service pays.
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
			{ key: serviceKey(), record: recorder({ userId: u.id, keepText: u.helpImprove }) },
		),
	);
}
