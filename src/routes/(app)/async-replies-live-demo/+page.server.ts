import { error, fail } from "@sveltejs/kit";
import { z } from "zod";
import { dev } from "$app/environment";
import { ASYNC_REPLY_DEMO_TASKS } from "$lib/async-replies/live-demo";
import { generateAgentResponse } from "$lib/server/async-replies/generator";
import { requireUser } from "$lib/server/auth/authz";
import type { Actions, PageServerLoad } from "./$types";

const historySchema = z.array(
	z.object({
		id: z.union([z.number().int().positive(), z.string().min(1)]),
		role: z.enum(["user", "assistant"]),
		content: z.string().min(1).max(50_000),
	}),
);

export const load: PageServerLoad = async (event) => {
	if (!dev) throw error(404, "Not found");
	requireUser(event);
	return { tasks: ASYNC_REPLY_DEMO_TASKS };
};

export const actions: Actions = {
	run: async (event) => {
		if (!dev) throw error(404, "Not found");
		const user = requireUser(event);
		const data = await event.request.formData();
		const task = ASYNC_REPLY_DEMO_TASKS.find((candidate) => candidate.id === data.get("taskId"));
		if (!task) return fail(400, { error: "Unknown demo task" });
		const parsedHistory = historySchema.safeParse(JSON.parse(String(data.get("history") ?? "[]")));
		if (!parsedHistory.success) return fail(400, { error: "Invalid demo history" });

		try {
			const result = await generateAgentResponse({
				baseSystemPrompt: task.systemPrompt,
				ui: task.ui,
				history: parsedHistory.data,
				userId: user.id,
				additionalInstruction: String(data.get("instruction") ?? "") || undefined,
			});
			return { success: true, result };
		} catch (cause) {
			return fail(500, { error: cause instanceof Error ? cause.message : "Generation failed" });
		}
	},
};
