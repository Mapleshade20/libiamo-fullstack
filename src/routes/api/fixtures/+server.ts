import { FIXTURES } from "#lib/server/dev/fixtures/index.ts";
import { learner } from "#lib/server/guard.ts";
import { dev } from "$app/env";

// Test drafts for the developer settings (development, or an admin).
export const GET = () => {
	if (!dev && learner().role !== "admin") return new Response("Not found", { status: 404 });
	return Response.json(
		Object.entries(FIXTURES)
			.filter(([id]) => id !== "darktail")
			.map(([id, f]) => ({ id, title: f.draft.title ?? "", text: f.draft.text, background: f.draft.background ?? "", learner: f.draft.learner })),
	);
};
