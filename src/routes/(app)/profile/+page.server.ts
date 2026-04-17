import { fail, redirect } from "@sveltejs/kit";
import { z } from "zod";
import { profileSchema, switchLanguageSchema } from "$lib/schemas";
import { auth } from "$lib/server/auth";
import { db } from "$lib/server/db";
import { userLearningProfile } from "$lib/server/db/schema";
import type { Actions } from "./$types";

export const actions: Actions = {
	updateProfile: async (event) => {
		const formData = await event.request.formData();
		const raw = {
			name: formData.get("name")?.toString() ?? undefined,
			timezone: formData.get("timezone")?.toString() ?? undefined,
			nativeLanguage: formData.get("nativeLanguage")?.toString() ?? undefined,
		};

		const result = profileSchema.safeParse(raw);
		if (!result.success) {
			return fail(400, { errors: z.flattenError(result.error).fieldErrors, values: raw });
		}

		const body = Object.fromEntries(Object.entries(result.data).filter(([_, v]) => v !== undefined));

		await auth.api.updateUser({
			body,
			headers: event.request.headers,
		});

		return { success: true };
	},

	switchLanguage: async (event) => {
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

		const userId = event.locals.user?.id;
		if (!userId) return fail(401);

		await db
			.insert(userLearningProfile)
			.values({
				userId,
				language: result.data.language,
			})
			.onConflictDoNothing();

		return redirect(302, "/");
	},

	signOut: async (event) => {
		await auth.api.signOut({ headers: event.request.headers });
		return redirect(302, "/sign-in");
	},
};
