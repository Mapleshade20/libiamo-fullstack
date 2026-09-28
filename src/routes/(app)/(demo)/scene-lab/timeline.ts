import { getDeliveryDelayMs } from "$lib/practice/reply-timing";
import type { SimResult } from "./simulate";

/**
 * When each transcript entry appeared, in simulated ms from the start. Deliveries after the first
 * of a turn follow the worker's pacing; runs recorded before the clock get plausible times.
 */
export function entryTimes(result: SimResult): Map<number, number> {
	const times = new Map<number, number>();
	let id = result.transcript.filter((entry) => entry.opening).length + 1;
	let clock = 0;
	for (const turn of result.turns) {
		if (turn.learner) {
			clock = turn.at ?? clock + 45_000;
			times.set(id++, clock);
		} else if (turn.scene) {
			let at = turn.at ?? clock + (turn.event.kind === "follow_up" ? 3_600_000 : 30_000) + turn.latencyMs;
			for (const [index, delivery] of turn.scene.deliveries.entries()) {
				if (index > 0) at += getDeliveryDelayMs(delivery.content);
				times.set(id++, at);
			}
			clock = Math.max(clock, at);
		}
	}
	return times;
}

const LONG_GAP = 5 * 60_000;
const SHORT_GAP = 8_000;

/** Maps simulated time to playback time: silences longer than five minutes play as a few seconds. */
export function playbackScale(times: number[]): (at: number) => number {
	const points = [...new Set(times)].sort((a, b) => a - b);
	const shifts: Array<[number, number]> = [];
	let removed = 0;
	for (let index = 1; index < points.length; index += 1) {
		const gap = points[index] - points[index - 1];
		if (gap > LONG_GAP) removed += gap - SHORT_GAP;
		shifts.push([points[index], removed]);
	}
	return (at) => at - (shifts.findLast(([from]) => from <= at)?.[1] ?? 0);
}

export function formatClock(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const rest = String(seconds % 60).padStart(2, "0");
	return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}
