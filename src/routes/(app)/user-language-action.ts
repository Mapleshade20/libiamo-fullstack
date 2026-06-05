import { fail, redirect } from "@sveltejs/kit";
import { switchLanguageSchema } from "$lib/schemas";
import { auth } from "$lib/server/auth/auth";
import { requireUser } from "$lib/server/auth/authz";
import { db } from "$lib/server/db";
import { userLearningProfile } from "$lib/server/db/schema";

export async function switchActiveLanguage(event: { locals: App.Locals; request: Request }) {
	const user = requireUser(event);
	const formData = await event.request.formData();
	const raw = { language: formData.get("language")?.toString() ?? "" };

	const result = switchLanguageSchema.safeParse(raw);
	if (!result.success) {
		return fail(400, { message: "Invalid language" });
	}

	await auth.api.updateUser({
		body: { activeLanguage: result.data.language },
		headers: event.request.headers,
	});

	await db
		.insert(userLearningProfile)
		.values({
			userId: user.id,
			language: result.data.language,
		})
		.onConflictDoNothing();

	return redirect(302, "/");
}
