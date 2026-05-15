import { fail, redirect } from "@sveltejs/kit";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { signUpSchema } from "$lib/schemas";
import { encryptApiKey, verifyApiKey } from "$lib/server/api-key-crypto";
import { auth } from "$lib/server/auth";
import { db } from "$lib/server/db";
import { userApiKey, userLearningProfile } from "$lib/server/db/schema";
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
			apiKey: formData.get("apiKey")?.toString() || undefined,
			apiBaseUrl: formData.get("apiBaseUrl")?.toString() || undefined,
			apiModel: formData.get("apiModel")?.toString() || undefined,
		};

		// Return values for form re-population, with secrets stripped
		const safeValues = (overrides?: Partial<typeof raw>) => {
			const { password: _, apiKey: __, ...safe } = { ...raw, ...overrides };
			return safe;
		};

		const result = signUpSchema.safeParse(raw);
		if (!result.success) {
			return fail(400, { errors: z.flattenError(result.error).fieldErrors, values: safeValues() });
		}

		// Verify BYOK before creating the user, so a bad key blocks signup entirely
		const apiKey = result.data.apiKey?.trim();
		const apiBaseUrl = result.data.apiBaseUrl?.trim();
		const apiModel = result.data.apiModel?.trim();

		if (apiKey && apiBaseUrl && apiModel) {
			const verification = await verifyApiKey(apiBaseUrl, apiKey, apiModel);
			if (!verification.ok) {
				return fail(400, { message: `API key verification failed: ${verification.error}`, values: safeValues() });
			}
		}

		try {
			const res = await auth.api.signUpEmail({
				body: {
					email: result.data.email,
					password: result.data.password,
					name: result.data.name,
					// Using validated timezone from Zod result to prevent injection/errors
					timezone: result.data.timezone,
					activeLanguage: result.data.activeLanguage,
				},
				headers: event.request.headers,
			});

			if (res.user) {
				await db
					.insert(userLearningProfile)
					.values({
						userId: res.user.id,
						language: result.data.activeLanguage,
					})
					.onConflictDoNothing();

				// Store the already-verified BYOK key
				if (apiKey && apiBaseUrl && apiModel) {
					await db
						.insert(userApiKey)
						.values({
							userId: res.user.id,
							encryptedKey: encryptApiKey(apiKey),
							baseUrl: apiBaseUrl,
							model: apiModel,
						})
						.onConflictDoNothing();
				}
			}
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, { message: error.message || "Registration failed", values: safeValues() });
			}
			return fail(500, { message: "Unexpected error", values: safeValues() });
		}

		return redirect(302, "/verify?pending=1");
	},
};
