import { fail, redirect } from "@sveltejs/kit";
import { base } from "$app/paths";
import { env } from "$env/dynamic/private";
import { switchLanguageSchema } from "$lib/schemas";
import { auth } from "$lib/server/auth/auth";
import { requireUser } from "$lib/server/auth/authz";
import { disabledLanguages } from "$lib/server/env";

export async function switchActiveLanguage(event: { locals: App.Locals; request: Request }) {
	requireUser(event);
	const formData = await event.request.formData();
	const raw = { language: formData.get("language")?.toString() ?? "" };

	const result = switchLanguageSchema.safeParse(raw);
	if (!result.success) {
		return fail(400, { message: "Invalid language" });
	}
	if (disabledLanguages(env.DISABLED_LANGUAGES).includes(result.data.language)) {
		return fail(400, { message: "This language is opening soon" });
	}

	await auth.api.updateUser({
		body: { activeLanguage: result.data.language },
		headers: event.request.headers,
	});

	return redirect(302, `${base}/`);
}
