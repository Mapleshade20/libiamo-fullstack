import { fail, redirect } from "@sveltejs/kit";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { base } from "$app/paths";
import { env } from "$env/dynamic/private";
import { isSocialProviderId, socialAuthErrorMessage } from "$lib/auth/social";
import { signInSchema } from "$lib/schemas";
import { auth } from "$lib/server/auth/auth";
import { configuredSocialProviderIds } from "$lib/server/auth/social";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) {
		return redirect(302, `${base}/`);
	}
	const reset = event.url.searchParams.get("reset");
	return {
		resetSuccess: reset === "success",
		socialProviders: configuredSocialProviderIds(env),
		socialAuthError: socialAuthErrorMessage(event.url.searchParams.get("error")),
	};
};

export const actions: Actions = {
	default: async (event) => {
		const formData = await event.request.formData();
		const provider = formData.get("provider")?.toString();
		if (provider !== undefined) {
			const availableProviders = configuredSocialProviderIds(env);
			if (!isSocialProviderId(provider) || !availableProviders.includes(provider)) {
				return fail(400, { message: "This sign-in method is unavailable." });
			}

			let authorizationURL: string | undefined;
			try {
				const result = await auth.api.signInSocial({
					body: {
						provider,
						callbackURL: `${base}/`,
						errorCallbackURL: `${base}/sign-in`,
						disableRedirect: true,
					},
					headers: event.request.headers,
				});
				authorizationURL = result.url;
			} catch (error) {
				if (error instanceof APIError) {
					return fail(400, { message: "Google or GitHub sign-in could not be started. Please try again." });
				}
				return fail(500, { message: "Google or GitHub sign-in could not be started. Please try again." });
			}

			if (!authorizationURL) {
				return fail(500, { message: "Google or GitHub sign-in could not be started. Please try again." });
			}
			return redirect(303, authorizationURL);
		}

		const raw = {
			email: formData.get("email")?.toString() ?? "",
			password: formData.get("password")?.toString() ?? "",
		};

		const result = signInSchema.safeParse(raw);
		if (!result.success) {
			return fail(400, { errors: z.flattenError(result.error).fieldErrors, values: raw });
		}

		try {
			await auth.api.signInEmail({
				body: {
					email: result.data.email,
					password: result.data.password,
				},
				headers: event.request.headers,
			});
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, { message: error.message || "Sign in failed", values: raw });
			}
			return fail(500, { message: "Unexpected error", values: raw });
		}

		return redirect(302, `${base}/`);
	},
};
