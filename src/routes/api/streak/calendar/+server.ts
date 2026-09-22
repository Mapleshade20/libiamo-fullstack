import { json } from "@sveltejs/kit";
import { localDay } from "$lib/local-day";
import { getBrowserTimezone } from "$lib/server/browser-timezone";
import { devStreakDayOffset, getStreakCalendar } from "$lib/server/streak";
import { validMonth } from "$lib/streak-history";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, cookies, url }) => {
	if (!locals.user) return json({ error: "Unauthorized" }, { status: 401 });
	const month = url.searchParams.get("month") ?? "";
	if (!validMonth(month)) return json({ error: "Invalid month" }, { status: 400 });
	const today = localDay(Date.now() + devStreakDayOffset() * 86_400_000, getBrowserTimezone(cookies));
	return json(await getStreakCalendar(locals.user.id, month, today), { headers: { "Cache-Control": "private, no-store" } });
};
