import crypto from "node:crypto";
import { error, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { db } from "$lib/server/db";
import { task } from "$lib/server/db/schema";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	if (!user) return redirect(302, "/sign-in");

	const taskIdStr = event.params.id;
	const taskId = Number(taskIdStr);

	if (Number.isNaN(taskId)) {
		return error(404, "Invalid task ID");
	}

	// 1. Fetch the agentPrompt from the database for this specific task
	const [taskRecord] = await db.select({ agentPrompt: task.agentPrompt }).from(task).where(eq(task.id, taskId)).limit(1);

	if (!taskRecord) {
		return error(404, "Task not found");
	}

	// Use the exact same domain and parameters as +layout.server.ts to sync avatars
	const email = user.email?.toLowerCase() || "";
	const hash = crypto.createHash("md5").update(email).digest("hex");
	const avatarUrl = `https://cn.cravatar.com/avatar/${hash}?d=identicon&s=192`;

	// Retrieve active language
	const learningLanguage = user.activeLanguage || "en";

	return {
		taskId: taskIdStr,
		agentPrompt: taskRecord.agentPrompt || "", // 2. Return agentPrompt to the page
		user: {
			name: user.name || "Learner",
			avatarUrl,
			learningLanguage,
		},
	};
};
