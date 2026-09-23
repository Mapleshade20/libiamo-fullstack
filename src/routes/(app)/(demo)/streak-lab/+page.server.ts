import { error, fail } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { dev } from "$app/environment";
import { requireUser } from "$lib/server/auth/authz";
import { getBrowserTimezone } from "$lib/server/browser-timezone";
import { db } from "$lib/server/db";
import { userStreak } from "$lib/server/db/schema";
import {
	DEV_STREAK_DAY_OFFSET_COOKIE,
	devStreakDayOffset,
	getStreakRecord,
	recordQuestCompletion,
	recordReviewObservation,
} from "$lib/server/streak";
import { STREAK_BANK_MAX, type StreakRecord } from "$lib/streak";
import type { Actions, PageServerLoad } from "./$types";

function assertDev() {
	if (!dev) throw error(404, "Not found");
}

function readNumber(form: FormData, name: string, max: number) {
	const value = Number(form.get(name));
	if (!Number.isFinite(value)) return 0;
	return Math.min(max, Math.max(0, Math.trunc(value)));
}

export const load: PageServerLoad = async (event) => {
	assertDev();
	const user = requireUser(event);
	return { userId: user.id, dayOffset: devStreakDayOffset(), timeZone: getBrowserTimezone(event.cookies) };
};

export const actions: Actions = {
	/** Writes an arbitrary row so any state can be inspected against the real reader. */
	setState: async (event) => {
		assertDev();
		const user = requireUser(event);
		const form = await event.request.formData();
		const streakDays = readNumber(form, "streakDays", 9999);
		const record: StreakRecord = {
			streakDays,
			throughDate: streakDays > 0 ? String(form.get("throughDate") || "") || null : null,
			bank: readNumber(form, "bank", STREAK_BANK_MAX),
			progressDate: String(form.get("progressDate") || "") || null,
			taskCount: readNumber(form, "taskCount", 99),
			reviewCleared: form.get("reviewCleared") === "on",
			bankEarnedToday: readNumber(form, "bankEarnedToday", STREAK_BANK_MAX),
		};
		if (record.streakDays > 0 && !record.throughDate) return fail(400, { error: "A streak above zero needs a through date." });
		await db
			.insert(userStreak)
			.values({ userId: user.id, ...record, timeZone: getBrowserTimezone(event.cookies) })
			.onConflictDoUpdate({ target: userStreak.userId, set: { ...record, updatedAt: new Date() } });
		return { success: true };
	},

	reset: async (event) => {
		assertDev();
		const user = requireUser(event);
		await db.delete(userStreak).where(eq(userStreak.userId, user.id));
		return { success: true };
	},

	/** The production write paths, so the Live panel exercises real transactions and real rules. */
	quest: async (event) => {
		assertDev();
		const user = requireUser(event);
		await db.transaction((tx) => recordQuestCompletion(tx, user.id, new Date(), getBrowserTimezone(event.cookies)));
		return { success: true, record: await getStreakRecord(user.id) };
	},

	observe: async (event) => {
		assertDev();
		const user = requireUser(event);
		const record = await recordReviewObservation(user.id, new Date(), getBrowserTimezone(event.cookies));
		return { success: true, record };
	},

	travel: async (event) => {
		assertDev();
		requireUser(event);
		const days = Math.trunc(Number((await event.request.formData()).get("days")) || 0);
		event.cookies.set(DEV_STREAK_DAY_OFFSET_COOKIE, String(days), { path: "/", httpOnly: false, sameSite: "lax" });
		return { success: true, dayOffset: days };
	},
};
