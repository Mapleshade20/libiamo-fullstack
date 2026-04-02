import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';
import { switchLanguageSchema } from '$lib/schemas';
import { ensureTasksForDate, getMondayOfWeek, toDateString } from '$lib/server/tasks';
import { db } from '$lib/server/db';
import { task, template, userLearningProfile } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import type { LangCode } from '$lib/i18n';

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user!;
	const language = user.activeLanguage as LangCode;
	const today = new Date();

	await ensureTasksForDate(language, today);

	const mondayStr = toDateString(getMondayOfWeek(today));
	const todayStr = toDateString(today);

	const weeklyTasks = await db
		.select({
			id: task.id,
			titleResolved: task.titleResolved,
			descriptionResolved: task.descriptionResolved,
			objectivesResolved: task.objectivesResolved,
			date: task.date,
			templateType: template.type,
			templateUi: template.ui,
			templateDifficulty: template.difficulty,
			templateDuration: template.duration
		})
		.from(task)
		.innerJoin(template, eq(task.templateId, template.id))
		.where(and(eq(task.language, language), eq(task.date, mondayStr)));

	const dailyTasks = await db
		.select({
			id: task.id,
			titleResolved: task.titleResolved,
			descriptionResolved: task.descriptionResolved,
			objectivesResolved: task.objectivesResolved,
			date: task.date,
			templateType: template.type,
			templateUi: template.ui,
			templateDifficulty: template.difficulty,
			templateDuration: template.duration
		})
		.from(task)
		.innerJoin(template, eq(task.templateId, template.id))
		.where(and(eq(task.language, language), eq(task.date, todayStr)));

	return { weeklyTasks, dailyTasks, language };
};

export const actions: Actions = {
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

		// Ensure learning profile exists for the new language
		await db
			.insert(userLearningProfile)
			.values({
				userId: event.locals.user!.id,
				language: result.data.language
			})
			.onConflictDoNothing();

		return redirect(302, '/');
	}
};
