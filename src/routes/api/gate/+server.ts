import { traced } from "#lib/server/sessions.ts";
import { gate } from "#model/gate.ts";

// The composer's door (src/gate.ts): is this something to work on, and in which language?
export async function POST({ request }) {
	const b = await request.json();
	const strs = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
	return Response.json(
		await traced(request, "gate", () =>
			gate({
				mode: b.mode === "collect" ? "collect" : "check",
				text: String(b.text ?? ""),
				native: String(b.native ?? "en"),
				learning: strs(b.learning),
				active: String(b.active ?? "en"),
			}),
		),
	);
}
