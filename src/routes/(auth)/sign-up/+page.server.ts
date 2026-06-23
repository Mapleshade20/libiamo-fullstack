import { fail, redirect } from "@sveltejs/kit";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { signUpSchema } from "$lib/schemas";
import { auth } from "$lib/server/auth/auth";
import { db } from "$lib/server/db";
import { userLearningProfile, userQuota } from "$lib/server/db/schema";
import { getTrialTokenBudget } from "$lib/server/llm";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) {
		return redirect(302, "/");
	}
	return {};
};

export const actions: Actions = {
	default: async (event) => {
		const formData = await event.request.formData();
		const raw = {
			email: formData.get("email")?.toString() ?? "",
			password: formData.get("password")?.toString() ?? "",
			name: formData.get("name")?.toString() ?? "",
			activeLanguage: formData.get("activeLanguage")?.toString() ?? "",
			timezone: formData.get("timezone")?.toString() || "UTC",
		};

		const result = signUpSchema.safeParse(raw);
		if (!result.success) {
			return fail(400, { errors: z.flattenError(result.error).fieldErrors, values: raw });
		}

		try {
			const res = await auth.api.signUpEmail({
				body: {
					email: result.data.email,
					password: result.data.password,
					name: result.data.name,
					timezone: result.data.timezone,
					activeLanguage: result.data.activeLanguage,
				},
				headers: event.request.headers,
			});

			if (res.user) {
				const trialTokenBudget = getTrialTokenBudget();
				await Promise.all([
					db
						.insert(userLearningProfile)
						.values({
							userId: res.user.id,
							language: result.data.activeLanguage,
						})
						.onConflictDoNothing(),
					db
						.insert(userQuota)
						.values({ userId: res.user.id, trialTokens: trialTokenBudget, trialTotalTokens: trialTokenBudget })
						.onConflictDoNothing(),
				]);
			}
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, { message: error.message || "Registration failed", values: raw });
			}
			return fail(500, { message: "Unexpected error", values: raw });
		}

		return redirect(302, "/verify?pending=1");
	},
};
