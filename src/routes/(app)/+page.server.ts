/*
 * The home page's greeting and the shelf's heading, drawn once per visit at random. Some greetings belong to a time of
 * day or of the week (the learner's, in their time zone) and are only drawn then.
 */
const GREETS: Record<string, string[]> = {
	morning: ["greetMorning1", "greetMorning2"],
	afternoon: ["greetAfternoon1", "greetAfternoon2"],
	evening: ["greetEvening1", "greetEvening2"],
	night: ["greetNight1", "greetNight2"],
	weekend: ["greetWeekend1", "greetWeekend2"],
	monday: ["greetMonday"],
	friday: ["greetFriday"],
	any: Array.from({ length: 10 }, (_, i) => `greetAny${i + 1}`),
};
const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The hour and the day of the week where the learner is. */
function localNow(timeZone: string | null | undefined, now = new Date()) {
	const parts = new Intl.DateTimeFormat("en-US", { timeZone: timeZone ?? "UTC", hour: "numeric", hourCycle: "h23", weekday: "short" }).formatToParts(
		now,
	);
	return { h: Number(parts.find((p) => p.type === "hour")?.value ?? 12), day: DAYS.indexOf(parts.find((p) => p.type === "weekday")?.value ?? "") };
}

export function load({ locals }) {
	const { h, day } = localNow(locals.user?.timeZone);
	const timely = [
		...GREETS[h >= 5 && h < 11 ? "morning" : h >= 11 && h < 17 ? "afternoon" : h >= 17 && h < 23 ? "evening" : "night"],
		...(day === 0 || day === 6 ? GREETS.weekend : day === 1 ? GREETS.monday : day === 5 ? GREETS.friday : []),
	];
	// About one visit in three gets a greeting for the moment; the others, one for any time.
	return {
		greeting: pick(Math.random() < 0.35 ? timely : GREETS.any),
		shelfHead: pick(["shelfHead1", "shelfHead2", "shelfHead3", "shelfHead4"]),
	};
}
