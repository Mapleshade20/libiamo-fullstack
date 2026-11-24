/*
 * The home page's greeting and the shelf's heading. Some greetings belong to a time of day or of the week (the
 * learner's, in their time zone) and are only drawn then. Drawn from the page's clock (lib/time/clock.svelte.ts), which
 * the server renders with and the browser hydrates with, so both draw the same and coming home asks the server nothing;
 * the clock moves each minute, so a visit later draws again.
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
const HEADS = ["shelfHead1", "shelfHead2", "shelfHead3", "shelfHead4"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Numbers in [0, 1) from a seed (mulberry32): the same seed, the same draws. */
function draws(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function greetingAt(now: number, timeZone: string) {
	const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23", weekday: "short" }).formatToParts(now);
	const h = Number(parts.find((p) => p.type === "hour")?.value ?? 12);
	const day = DAYS.indexOf(parts.find((p) => p.type === "weekday")?.value ?? "");
	const timely = [
		...GREETS[h >= 5 && h < 11 ? "morning" : h >= 11 && h < 17 ? "afternoon" : h >= 17 && h < 23 ? "evening" : "night"],
		...(day === 0 || day === 6 ? GREETS.weekend : day === 1 ? GREETS.monday : day === 5 ? GREETS.friday : []),
	];
	const next = draws(Math.floor(now / 60_000));
	const pick = <T>(list: T[]) => list[Math.floor(next() * list.length)];
	// About one visit in three gets a greeting for the moment; the others, one for any time.
	return { greeting: pick(next() < 0.35 ? timely : GREETS.any), shelfHead: pick(HEADS) };
}
