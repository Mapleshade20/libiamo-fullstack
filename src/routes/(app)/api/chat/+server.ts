import { json } from "@sveltejs/kit";
import { createMultiTurnChat } from "$lib/server/client";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { userMessage, history, systemPrompt } = await request.json();

		const result = await createMultiTurnChat({
			userMessage,
			history,
			systemPrompt,
		});

		return json({ reply: result.reply });
	} catch (error: any) {
		console.error("Agent chat failed:", error);
		return json({ error: error.message }, { status: 500 });
	}
};
