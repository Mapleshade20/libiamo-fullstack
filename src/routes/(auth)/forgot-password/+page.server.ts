import { fail, redirect } from "@sveltejs/kit";
import { APIError } from "better-auth/api";
import { forgotPasswordSchema, resetPasswordSchema } from "$lib/schemas";
import { auth } from "$lib/server/auth";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	const token = event.url.searchParams.get("token");
	const error = event.url.searchParams.get("error");
	return {
		hasToken: !!token,
		token,
		...(error ? { error } : {}),
	};
};

export const actions: Actions = {
	requestReset: async (event) => {
		const formData = await event.request.formData();
		const raw = { email: formData.get("email")?.toString() ?? "" };

		const result = forgotPasswordSchema.safeParse(raw);
		if (!result.success) {
			return fail(400, { errors: result.error.flatten().fieldErrors, values: raw });
		}

		try {
			await auth.api.requestPasswordReset({
				body: {
					email: result.data.email,
					redirectTo: "/forgot-password",
				},
			});
		} catch {
			// Always return success to prevent email enumeration
		}

		return { emailSent: true };
	},

	resetPassword: async (event) => {
		const formData = await event.request.formData();
		const raw = {
			newPassword: formData.get("newPassword")?.toString() ?? "",
			token: formData.get("token")?.toString() ?? "",
		};

		const result = resetPasswordSchema.safeParse(raw);
		if (!result.success) {
			return fail(400, { resetErrors: result.error.flatten().fieldErrors });
		}

		try {
			await auth.api.resetPassword({
				body: {
					newPassword: result.data.newPassword,
					token: result.data.token,
				},
			});
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, { resetMessage: error.message || "Reset failed" });
			}
			return fail(500, { resetMessage: "Unexpected error" });
		}

		return redirect(302, "/sign-in?reset=success");
	},
};
