import { effectiveToday, localDay, type StreakRecord } from "$lib/streak/rules";
import { getDisplayClock } from "$lib/time/display-clock";
import { startOfNextLocalDay } from "$lib/time/local-day";

/** SSR uses the request snapshot. A sleeping tab and an open tab both cross local midnight. */
export function createStreakDay(options: () => { record: StreakRecord | null; offset: number }) {
	const clock = getDisplayClock();
	let now = $state<number | null>(null);
	$effect(() => {
		const zone = clock().timeZone;
		let timer: ReturnType<typeof setTimeout>;
		const schedule = () => {
			clearTimeout(timer);
			timer = setTimeout(
				() => {
					now = Date.now();
					schedule();
				},
				Math.max(1000, startOfNextLocalDay(Date.now(), zone).getTime() - Date.now() + 1000),
			);
		};
		const visible = () => {
			if (!document.hidden) {
				now = Date.now();
				schedule();
			}
		};
		schedule();
		document.addEventListener("visibilitychange", visible);
		return () => {
			clearTimeout(timer);
			document.removeEventListener("visibilitychange", visible);
		};
	});
	return () => effectiveToday(options().record, localDay((now ?? clock().now) + options().offset * 86400000, clock().timeZone));
}
