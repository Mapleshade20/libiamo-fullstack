import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';
import { profileSchema, switchLanguageSchema } from '$lib/schemas';
import { db } from '$lib/server/db';
import { userLearningProfile } from '$lib/server/db/schema';

export const actions: Actions = {
	updateProfile: async (event) => {
		const formData = await event.request.formData();
		const raw = {
			name: formData.get('name')?.toString() ?? undefined,
			timezone: formData.get('timezone')?.toString() ?? undefined,
			nativeLanguage: formData.get('nativeLanguage')?.toString() ?? undefined
		};

		const result = profileSchema.safeParse(raw);
		if (!result.success) {
			return fail(400, { errors: result.error.flatten().fieldErrors, values: raw });
		}

		await auth.api.updateUser({
			body: result.data,
			headers: event.request.headers
		});

		return { success: true };
	},

	switchLanguage: async (event) => {
		const formData = await event.request.formData();
		const raw = { language: formData.get('language')?.toString() ?? '' };

		const result = switchLanguageSchema.safeParse(raw);
		if (!result.success) {
			return fail(400, { message: 'Invalid language' });
		}

		await auth.api.updateUser({
			body: { activeLanguage: result.data.language },
			headers: event.request.headers
		});

		await db
			.insert(userLearningProfile)
			.values({
				userId: event.locals.user!.id,
				language: result.data.language
			})
			.onConflictDoNothing();

		return redirect(302, '/');
	},

	signOut: async (event) => {
		await auth.api.signOut({ headers: event.request.headers });
		return redirect(302, '/sign-in');
	}
};
