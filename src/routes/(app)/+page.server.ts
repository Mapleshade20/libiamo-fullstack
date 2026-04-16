import { fail, redirect } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import type { LangCode } from "$lib/i18n";
import { switchLanguageSchema } from "$lib/schemas";
import { auth } from "$lib/server/auth";
import { db } from "$lib/server/db";
import { task, template, userLearningProfile } from "$lib/server/db/schema";
import { ensureTasksForDate, getMondayOfWeek, toDateString } from "$lib/server/tasks";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	if (!user) return redirect(302, "/sign-in");
	const language = user.activeLanguage as LangCode;

	// Get user's timezone (saved during registration)
	const userTz = user.timezone || "UTC";

	// Get the current date exactly as the user sees it locally (Format: YYYY-MM-DD)
	let userLocalDateStr: string;
	try {
		userLocalDateStr = new Intl.DateTimeFormat("en-CA", {
			timeZone: userTz,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		}).format(new Date());
	} catch {
		userLocalDateStr = new Date().toISOString().slice(0, 10);
	}

	// Create a "safe" Date object anchored at 12:00 UTC.
	// This trick ensures that helper functions (like getMondayOfWeek) won't jump to the wrong day due to server-side timezone shifts.
	const [year, month, day] = userLocalDateStr.split("-").map(Number);
	const userTodayDateObj = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

	// Generate tasks if they don't exist yet, using our safe date object
	await ensureTasksForDate(language, userTodayDateObj);

	// Prepare pure YYYY-MM-DD strings for database querying
	const mondayStr = toDateString(getMondayOfWeek(userTodayDateObj));
	const todayStr = userLocalDateStr; // Directly use the local date string calculated above

	// Fetch this week's tasks (comparing purely on the date string)
	const weeklyTasks = await db
		.select({
			id: task.id,
			titleResolved: task.titleResolved,
			shortObjectiveResolved: task.shortObjectiveResolved,
			descriptionResolved: task.descriptionResolved,
			objectivesResolved: task.objectivesResolved,
			date: task.date, // Just YYYY-MM-DD string
			templateType: template.type,
			templateUi: template.ui,
			templateDifficulty: template.difficulty,
			templateDuration: template.duration,
		})
		.from(task)
		.innerJoin(template, eq(task.templateId, template.id))
		.where(and(eq(task.language, language), eq(task.date, mondayStr), eq(template.duration, "weekly")));

	// Fetch today's tasks (comparing purely on the date string)
	const dailyTasks = await db
		.select({
			id: task.id,
			titleResolved: task.titleResolved,
			shortObjectiveResolved: task.shortObjectiveResolved,
			descriptionResolved: task.descriptionResolved,
			objectivesResolved: task.objectivesResolved,
			date: task.date, // Just YYYY-MM-DD string
			templateType: template.type,
			templateUi: template.ui,
			templateDifficulty: template.difficulty,
			templateDuration: template.duration,
		})
		.from(task)
		.innerJoin(template, eq(task.templateId, template.id))
		.where(and(eq(task.language, language), eq(task.date, todayStr), eq(template.duration, "daily")));

	return {
		weeklyTasks,
		dailyTasks,
		language,
	};
};

export const actions: Actions = {
	switchLanguage: async (event) => {
		const formData = await event.request.formData();
		const raw = { language: formData.get("language")?.toString() ?? "" };

		const result = switchLanguageSchema.safeParse(raw);
		if (!result.success) {
			return fail(400, { message: "Invalid language" });
		}

		await auth.api.updateUser({
			body: { activeLanguage: result.data.language },
			headers: event.request.headers,
		});

		const userId = event.locals.user?.id;
		if (!userId) return fail(401);

		// Ensure learning profile exists for the new language
		await db
			.insert(userLearningProfile)
			.values({
				userId,
				language: result.data.language,
			})
			.onConflictDoNothing();

		return redirect(302, "/");
	},
};
