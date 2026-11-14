import { FIXTURES } from "#model/fixtures/index.ts";

// Test drafts for the developer settings.
export const GET = () =>
	Response.json(
		Object.entries(FIXTURES)
			.filter(([id]) => id !== "darktail")
			.map(([id, f]) => ({ id, title: f.draft.title ?? "", text: f.draft.text, background: f.draft.background ?? "", learner: f.draft.learner })),
	);
