import { createRawSnippet } from "svelte";
import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import { AGENT_REPLY_DEMO_TASKS } from "$lib/agent-replies/live-demo";
import {
	TRANSLATION_EVALUATION_LIVE_DEMO_RATINGS,
	TRANSLATION_EVALUATION_LIVE_DEMO_REVIEW_NOTE,
	TRANSLATION_EVALUATION_LIVE_DEMO_TASK,
} from "$lib/translation-evaluation/live-demo-fixture";
import WelcomeLayout from "$routes/welcome/+layout.svelte";

describe("welcome homepage", () => {
	it("keeps the Libiamo lyric hero and renders maintained product cases", () => {
		const children = createRawSnippet(() => ({ render: () => "" }));
		const { body } = render(WelcomeLayout, { props: { children } });
		const conversationPrompts = AGENT_REPLY_DEMO_TASKS.flatMap((task) => task.seedMessages.map((message) => message.content));

		expect(body).toContain('<h1 id="hero-title">Libiamo</h1>');
		expect(body).toContain("Speak in your own voice.");
		for (const prompt of conversationPrompts) expect(body).toContain(prompt);
		expect(body).not.toContain("Coordinate a weekend plan naturally, without acting like a tutor.");
		expect(body).not.toContain("Be candid, specific, and human.");
		expect(body).toContain("# weekend-plans");
		expect(body).toContain("Original post · You");
		expect(body).toContain("Source · 中文");
		expect(body).toContain("First draft · English");
		expect(body).toContain(TRANSLATION_EVALUATION_LIVE_DEMO_TASK.title);
		expect(body).toContain(TRANSLATION_EVALUATION_LIVE_DEMO_REVIEW_NOTE.vocab);
		expect(body).toContain(`Accuracy · ${TRANSLATION_EVALUATION_LIVE_DEMO_RATINGS.accuracy}`);
	});
});
