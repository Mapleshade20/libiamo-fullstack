import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';
import { signUpSchema } from '$lib/schemas';
import { APIError } from 'better-auth/api';
import { db } from '$lib/server/db';
import { userLearningProfile } from '$lib/server/db/schema';

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) {
		return redirect(302, '/');
	}
	return {};
};

export const actions: Actions = {
	default: async (event) => {
		const formData = await event.request.formData();
		const raw = {
			email: formData.get('email')?.toString() ?? '',
			password: formData.get('password')?.toString() ?? '',
			name: formData.get('name')?.toString() ?? '',
			activeLanguage: formData.get('activeLanguage')?.toString() ?? ''
		};

		const result = signUpSchema.safeParse(raw);
		if (!result.success) {
			return fail(400, { errors: result.error.flatten().fieldErrors, values: raw });
		}

		try {
			const res = await auth.api.signUpEmail({
				body: {
					email: result.data.email,
					password: result.data.password,
					name: result.data.name,
					activeLanguage: result.data.activeLanguage
				},
				headers: event.request.headers
			});

			if (res.user) {
				await db
					.insert(userLearningProfile)
					.values({
						userId: res.user.id,
						language: result.data.activeLanguage
					})
					.onConflictDoNothing();
			}
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, { message: error.message || 'Registration failed', values: raw });
			}
			return fail(500, { message: 'Unexpected error', values: raw });
		}

		return redirect(302, '/verify?pending=1');
	}
};
