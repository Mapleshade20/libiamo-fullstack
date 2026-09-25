import type { TraceOrigin } from "$lib/llm/lab";

export function formatLabTime(value: Date | string, timeZone: string): string {
	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
		timeZone,
	}).format(new Date(value));
}

export const ORIGIN_LABELS: Record<TraceOrigin, string> = { app: "Real flow", override: "Override", lab: "Lab" };

export function formatLatency(ms: number | null | undefined): string {
	if (ms === null || ms === undefined) return "—";
	return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
}
