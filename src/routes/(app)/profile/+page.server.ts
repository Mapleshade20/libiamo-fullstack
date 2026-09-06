import { fail, redirect } from "@sveltejs/kit";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { base } from "$app/paths";
import {
	getNativeLanguageOptions,
	getSelfAssignedLevel,
	isLanguageCode,
	isSelfAssignedLevel,
	type SelfAssignedLevel,
	withSelfAssignedLevel,
} from "$lib/constants";
import { TRIAL_QUOTA_DEPENDENCY } from "$lib/load-dependencies";
import { profileSchema, selfAssignedLevelSchema } from "$lib/schemas";
import { auth } from "$lib/server/auth/auth";
import { requireUser } from "$lib/server/auth/authz";
import { db } from "$lib/server/db";
import { userApiKey, userLearningProfile } from "$lib/server/db/schema";
import { encryptApiKey, verifyApiKey } from "$lib/server/llm";
import { getTrialQuotaBalance } from "$lib/server/trial-quota";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	event.depends?.(TRIAL_QUOTA_DEPENDENCY);
	const user = requireUser(event);
	const activeLanguage = isLanguageCode(user.activeLanguage) ? user.activeLanguage : "en";
	const [row, learningProfile] = await Promise.all([
		db.query.userApiKey.findFirst({
			where: (t, { eq }) => eq(t.userId, user.id),
			columns: { userId: true, baseUrl: true, model: true },
		}),
		db.query.userLearningProfile.findFirst({
			where: (t, { eq }) => eq(t.userId, user.id),
			columns: { levelSelfAssign: true },
		}),
	]);
	const hasApiKey = row !== undefined;
	const trialQuota = hasApiKey ? null : await getTrialQuotaBalance(user.id);

	return {
		serverNativeLanguages: getNativeLanguageOptions("en"),
		hasApiKey,
		trialQuota,
		apiBaseUrl: row?.baseUrl ?? "",
		apiModel: row?.model ?? "",
		levelSelfAssign: getSelfAssignedLevel(learningProfile?.levelSelfAssign, activeLanguage),
	};
};

export const actions: Actions = {
	updateProfile: async (event) => {
		const user = requireUser(event);

		const formData = await event.request.formData();
		const raw = {
			name: formData.get("name")?.toString() ?? undefined,
			nativeLanguage: formData.get("nativeLanguage")?.toString() ?? undefined,
			feedbackLanguagePreference: formData.get("feedbackLanguagePreference")?.toString() ?? undefined,
			apiKey: formData.get("apiKey")?.toString() || undefined,
			apiBaseUrl: formData.get("apiBaseUrl")?.toString() || undefined,
			apiModel: formData.get("apiModel")?.toString() || undefined,
		};

		const result = profileSchema.safeParse(raw);
		const safeValues = (overrides?: Partial<typeof raw>) => {
			const { apiKey: _, ...safe } = { ...raw, ...overrides };
			return safe;
		};
		if (!result.success) {
			return fail(400, { errors: z.flattenError(result.error).fieldErrors, values: safeValues() });
		}

		// Update user profile fields
		const body = Object.fromEntries(
			Object.entries(result.data).filter(([k, v]) => v !== undefined && k !== "apiKey" && k !== "apiBaseUrl" && k !== "apiModel"),
		);

		if (Object.keys(body).length > 0) {
			await auth.api.updateUser({
				body,
				headers: event.request.headers,
			});
		}

		// Handle BYOK API key: overwrite-style update
		const apiKey = result.data.apiKey?.trim();
		if (apiKey) {
			const apiBaseUrl = result.data.apiBaseUrl?.trim();
			const apiModel = result.data.apiModel?.trim();

			// Verify the key before saving
			if (apiBaseUrl && apiModel) {
				const verification = await verifyApiKey(apiBaseUrl, apiKey, apiModel);
				if (!verification.ok) {
					return fail(400, {
						message: `API key verification failed: ${verification.error}`,
						values: safeValues(),
					});
				}

				await db
					.insert(userApiKey)
					.values({ userId: user.id, encryptedKey: encryptApiKey(apiKey), baseUrl: apiBaseUrl, model: apiModel })
					.onConflictDoUpdate({ target: userApiKey.userId, set: { encryptedKey: encryptApiKey(apiKey), baseUrl: apiBaseUrl, model: apiModel } });
			}
		}

		return { success: true };
	},

	clearApiKey: async (event) => {
		const user = requireUser(event);

		await db.delete(userApiKey).where(eq(userApiKey.userId, user.id));
		return { success: true };
	},

	updateProficiency: async (event) => {
		const user = requireUser(event);
		const activeLanguage = isLanguageCode(user.activeLanguage) ? user.activeLanguage : null;
		if (!activeLanguage) return fail(400, { proficiencyError: true });

		const formData = await event.request.formData();
		const result = selfAssignedLevelSchema.safeParse({ levelSelfAssign: formData.get("levelSelfAssign") });
		if (!result.success || !isSelfAssignedLevel(result.data.levelSelfAssign)) {
			return fail(400, { proficiencyError: true });
		}

		const levelSelfAssign: SelfAssignedLevel = result.data.levelSelfAssign;
		await db
			.insert(userLearningProfile)
			.values({ userId: user.id, levelSelfAssign: withSelfAssignedLevel(undefined, activeLanguage, levelSelfAssign) })
			.onConflictDoUpdate({
				target: userLearningProfile.userId,
				set: {
					levelSelfAssign: sql`jsonb_set(
						${userLearningProfile.levelSelfAssign},
						ARRAY[${activeLanguage}]::text[],
						to_jsonb(${levelSelfAssign}::integer),
						true
					)`,
					updatedAt: new Date(),
				},
			});

		return { success: true, levelSelfAssign };
	},

	signOut: async (event) => {
		requireUser(event);
		await auth.api.signOut({ headers: event.request.headers });
		return redirect(302, `${base}/sign-in`);
	},
};
