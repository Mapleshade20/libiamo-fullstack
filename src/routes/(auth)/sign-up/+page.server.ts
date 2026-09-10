import { fail, redirect } from "@sveltejs/kit";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { base } from "$app/paths";
import { env } from "$env/dynamic/private";
import { isSocialProviderId, socialAuthErrorMessage } from "$lib/auth/social";
import { isLanguageCode } from "$lib/constants";
import { signUpSchema } from "$lib/schemas";
import { auth } from "$lib/server/auth/auth";
import { configuredSocialProviderIds } from "$lib/server/auth/social";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) {
		return redirect(302, `${base}/`);
	}
	return {
		socialProviders: configuredSocialProviderIds(env),
		socialAuthError: socialAuthErrorMessage(event.url.searchParams.get("error")),
	};
};

export const actions: Actions = {
	default: async (event) => {
		const formData = await event.request.formData();
		const provider = formData.get("provider")?.toString();
		if (provider !== undefined) {
			const activeLanguage = formData.get("activeLanguage")?.toString() ?? "";
			const availableProviders = configuredSocialProviderIds(env);

			if (!isLanguageCode(activeLanguage)) {
				return fail(400, {
					errors: { activeLanguage: ["Choose a language before continuing."] },
					values: { activeLanguage },
				});
			}
			if (!isSocialProviderId(provider) || !availableProviders.includes(provider)) {
				return fail(400, { message: "This sign-up method is unavailable.", values: { activeLanguage } });
			}

			let authorizationURL: string | undefined;
			try {
				const result = await auth.api.signInSocial({
					body: {
						provider,
						callbackURL: `${base}/`,
						errorCallbackURL: `${base}/sign-up`,
						disableRedirect: true,
						requestSignUp: true,
						additionalData: { activeLanguage },
					},
					headers: event.request.headers,
				});
				authorizationURL = result.url;
			} catch (error) {
				if (error instanceof APIError) {
					return fail(400, { message: "Google or GitHub sign-up could not be started. Please try again.", values: { activeLanguage } });
				}
				return fail(500, { message: "Google or GitHub sign-up could not be started. Please try again.", values: { activeLanguage } });
			}

			if (!authorizationURL) {
				return fail(500, { message: "Google or GitHub sign-up could not be started. Please try again.", values: { activeLanguage } });
			}
			return redirect(303, authorizationURL);
		}

		const raw = {
			email: formData.get("email")?.toString() ?? "",
			password: formData.get("password")?.toString() ?? "",
			name: formData.get("name")?.toString() ?? "",
			activeLanguage: formData.get("activeLanguage")?.toString() ?? "",
		};

		const result = signUpSchema.safeParse(raw);
		if (!result.success) {
			return fail(400, { errors: z.flattenError(result.error).fieldErrors, values: raw });
		}

		try {
			await auth.api.signUpEmail({
				body: {
					email: result.data.email,
					password: result.data.password,
					name: result.data.name,
					activeLanguage: result.data.activeLanguage,
				},
				headers: event.request.headers,
			});
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, { message: error.message || "Registration failed", values: raw });
			}
			return fail(500, { message: "Unexpected error", values: raw });
		}

		return redirect(302, `${base}/verify?pending=1`);
	},
};
