import { fail, redirect } from "@sveltejs/kit";
import { APIError } from "better-auth/api";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { base } from "$app/paths";
import { env } from "$env/dynamic/private";
import { type AccountActionResult, accountActionErrorResult, isSocialProviderId, SOCIAL_PROVIDERS, socialAuthFailure } from "$lib/auth/social";
import { getNativeLanguageOptions, getSelfAssignedLevel, isLanguageCode, isSelfAssignedLevel, type SelfAssignedLevel } from "$lib/constants";
import { TRIAL_QUOTA_DEPENDENCY } from "$lib/load-dependencies";
import { profileSchema, selfAssignedLevelSchema } from "$lib/schemas";
import { auth } from "$lib/server/auth/auth";
import { requireUser } from "$lib/server/auth/authz";
import { configuredSocialProviderIds } from "$lib/server/auth/social";
import { db } from "$lib/server/db";
import { userApiKey, user as userTable } from "$lib/server/db/schema";
import { encryptApiKey, verifyApiKey } from "$lib/server/llm";
import { getTrialQuotaBalance } from "$lib/server/trial-quota";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	event.depends?.(TRIAL_QUOTA_DEPENDENCY);
	const user = requireUser(event);
	const activeLanguage = isLanguageCode(user.activeLanguage) ? user.activeLanguage : "en";
	const [row, learner, accounts] = await Promise.all([
		db.query.userApiKey.findFirst({
			where: (t, { eq }) => eq(t.userId, user.id),
			columns: { userId: true, baseUrl: true, model: true },
		}),
		db.query.user.findFirst({
			where: (t, { eq }) => eq(t.id, user.id),
			columns: { levelSelfAssign: true },
		}),
		auth.api.listUserAccounts({ headers: event.request.headers }),
	]);
	const hasApiKey = row !== undefined;
	const trialQuota = hasApiKey ? null : await getTrialQuotaBalance(user.id);
	const configuredProviders = configuredSocialProviderIds(env);
	const connectedProviders = new Map(accounts.map(({ providerId, createdAt }) => [providerId, createdAt]));
	const linkedProvider = event.url.searchParams.get("linked");
	const accountResult: AccountActionResult | null = isSocialProviderId(linkedProvider) && connectedProviders.has(linkedProvider) ? "connected" : null;

	return {
		serverNativeLanguages: getNativeLanguageOptions(activeLanguage),
		hasApiKey,
		trialQuota,
		apiBaseUrl: row?.baseUrl ?? "",
		apiModel: row?.model ?? "",
		levelSelfAssign: getSelfAssignedLevel(learner?.levelSelfAssign, activeLanguage),
		credentialConnected: connectedProviders.has("credential"),
		loginMethodCount: connectedProviders.size,
		socialLoginMethods: SOCIAL_PROVIDERS.map((provider) => ({
			...provider,
			configured: configuredProviders.includes(provider.id),
			connected: connectedProviders.has(provider.id),
			// A provider account may now carry a different address than the Libiamo
			// account, so "Connected" alone leaves nobody able to tell which account
			// they attached. The row's age is the cheapest thing that distinguishes it
			// without storing anything new.
			connectedAt: connectedProviders.get(provider.id)?.toISOString() ?? null,
		})),
		accountResult,
		// Better Auth reports why it refused in the parameter's value; collapsing that
		// to a boolean is what left every failure sharing one unhelpful notice.
		accountFailure: socialAuthFailure(event.url.searchParams.get("error")),
	};
};

export const actions: Actions = {
	linkSocialAccount: async (event) => {
		requireUser(event);
		const formData = await event.request.formData();
		const provider = formData.get("provider")?.toString();

		if (!isSocialProviderId(provider) || !configuredSocialProviderIds(env).includes(provider)) {
			return fail(400, { accountResult: "error" });
		}

		// `account_user_provider_unique` allows one account per provider per user, and
		// nothing below this point would report a violation as anything but a 500 — the
		// insert happens inside Better Auth's OAuth callback. The button is hidden once a
		// provider is connected, so this only catches a hand-rolled POST, but it keeps the
		// rule the index enforces stated where a reader of this action can see it.
		const accounts = await auth.api.listUserAccounts({ headers: event.request.headers });
		if (accounts.some(({ providerId }) => providerId === provider)) {
			return fail(400, { accountResult: "error" });
		}

		let authorizationURL: string | undefined;
		try {
			const result = await auth.api.linkSocialAccount({
				body: {
					provider,
					callbackURL: `${base}/profile?linked=${provider}`,
					errorCallbackURL: `${base}/profile`,
					disableRedirect: true,
				},
				headers: event.request.headers,
			});
			authorizationURL = result.url;
		} catch (error) {
			if (error instanceof APIError) return fail(400, { accountResult: accountActionErrorResult(error.body?.code) });
			return fail(500, { accountResult: "error" });
		}

		if (!authorizationURL) return fail(500, { accountResult: "error" });
		return redirect(303, authorizationURL);
	},

	unlinkSocialAccount: async (event) => {
		requireUser(event);
		const formData = await event.request.formData();
		const provider = formData.get("provider")?.toString();

		if (!isSocialProviderId(provider)) return fail(400, { accountResult: "error" });

		try {
			await auth.api.unlinkAccount({
				body: { providerId: provider },
				headers: event.request.headers,
			});
		} catch (error) {
			if (error instanceof APIError) return fail(400, { accountResult: accountActionErrorResult(error.body?.code) });
			return fail(500, { accountResult: "error" });
		}

		return { accountResult: "disconnected" };
	},

	// An account created through Google or GitHub has no credential row, and Better
	// Auth exposes no way to add one from a session: `changePassword` requires the
	// password that does not exist yet, and `setPassword` only ships in the admin
	// plugin. Its reset flow does create the missing row, so this sends that mail —
	// addressed from the session rather than from something the user retypes, which
	// is what made the public forgot-password form fail silently for these accounts.
	sendPasswordSetup: async (event) => {
		const user = requireUser(event);

		try {
			await auth.api.requestPasswordReset({
				body: { email: user.email, redirectTo: `${base}/forgot-password` },
			});
		} catch (error) {
			if (error instanceof APIError) return fail(400, { passwordSetupSent: false });
			return fail(500, { passwordSetupSent: false });
		}

		return { passwordSetupSent: true };
	},

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
			.update(userTable)
			.set({
				levelSelfAssign: sql`jsonb_set(
					${userTable.levelSelfAssign},
					ARRAY[${activeLanguage}]::text[],
					to_jsonb(${levelSelfAssign}::integer),
					true
				)`,
				updatedAt: new Date(),
			})
			.where(eq(userTable.id, user.id));

		return { success: true, levelSelfAssign };
	},

	signOut: async (event) => {
		requireUser(event);
		await auth.api.signOut({ headers: event.request.headers });
		return redirect(302, `${base}/sign-in`);
	},
};
