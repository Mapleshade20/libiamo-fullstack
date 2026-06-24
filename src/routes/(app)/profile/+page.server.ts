import { fail, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getNativeLanguageOptions } from "$lib/constants";
import { profileSchema } from "$lib/schemas";
import { auth } from "$lib/server/auth/auth";
import { requireUser } from "$lib/server/auth/authz";
import { db } from "$lib/server/db";
import { userApiKey } from "$lib/server/db/schema";
import { encryptApiKey, verifyApiKey } from "$lib/server/llm";
import { getTrialQuotaBalance } from "$lib/server/trial-quota";
import { switchActiveLanguage } from "../user-language-action";
import type { Actions, PageServerLoad } from "./$types";

/**
 * Build timezone option list with UTC offset and long display name.
 * Uses a single `now` per entry for both Intl.DateTimeFormat.formatToParts calls.
 */
function buildTimezoneList(): { value: string; label: string }[] {
	try {
		const raw = Intl.supportedValuesOf("timeZone");
		return raw.map((tz) => {
			try {
				const now = new Date();

				const offsetParts = new Intl.DateTimeFormat("en-US", {
					timeZone: tz,
					timeZoneName: "shortOffset",
				}).formatToParts(now);
				const utcOffset = offsetParts.find((p) => p.type === "timeZoneName")?.value.replace("GMT", "UTC") || "";

				const localizedName =
					new Intl.DateTimeFormat("en-US", {
						timeZone: tz,
						timeZoneName: "long",
					})
						.formatToParts(now)
						.find((p) => p.type === "timeZoneName")?.value || tz;

				return {
					value: tz,
					label: `${tz} (${localizedName}, ${utcOffset})`,
				};
			} catch {
				return { value: tz, label: tz };
			}
		});
	} catch {
		// Runtime doesn't support Intl.supportedValuesOf — return empty
		return [];
	}
}

// Memoize at module scope: Intl.supportedValuesOf("timeZone") is static.
let _cachedTimezones: { value: string; label: string }[] | undefined;

function getMemoizedTimezones(): { value: string; label: string }[] {
	if (!_cachedTimezones) {
		_cachedTimezones = buildTimezoneList();
	}
	return _cachedTimezones;
}

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	const row = await db.query.userApiKey.findFirst({
		where: (t, { eq }) => eq(t.userId, user.id),
		columns: { userId: true, baseUrl: true, model: true },
	});
	const hasApiKey = row !== undefined;
	const trialQuota = hasApiKey ? null : await getTrialQuotaBalance(user.id);

	return {
		serverTimezones: getMemoizedTimezones(),
		serverNativeLanguages: getNativeLanguageOptions("en"),
		hasApiKey,
		trialQuota,
		apiBaseUrl: row?.baseUrl ?? "",
		apiModel: row?.model ?? "",
	};
};

export const actions: Actions = {
	updateProfile: async (event) => {
		const user = requireUser(event);

		const formData = await event.request.formData();
		const raw = {
			name: formData.get("name")?.toString() ?? undefined,
			timezone: formData.get("timezone")?.toString() ?? undefined,
			nativeLanguage: formData.get("nativeLanguage")?.toString() ?? undefined,
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

	switchLanguage: switchActiveLanguage,

	signOut: async (event) => {
		requireUser(event);
		await auth.api.signOut({ headers: event.request.headers });
		return redirect(302, "/sign-in");
	},
};
