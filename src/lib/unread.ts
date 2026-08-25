export type UnreadInboxItem = {
	taskId: number;
	title: string;
	ui: string;
	sessionStatus: string;
	unreadCount: number;
	latestAgeSeconds: number | null;
};

/**
 * Abandoned sessions route to the transcript, not the report: the feedback page
 * refuses them, and the reply that made one unread is the agent's parting message
 * after an abuse termination, which only the session view renders.
 */
export function unreadTargetHref(item: Pick<UnreadInboxItem, "taskId" | "sessionStatus">): string {
	return `/task/${item.taskId}/${item.sessionStatus === "completed" || item.sessionStatus === "evaluated" ? "feedback" : "session"}`;
}

/**
 * Formats an age in seconds as a localized relative time label.
 * Both the age and the label are produced without parsing timestamps on the
 * client, so the naive-UTC column convention never leaks into the UI.
 */
export function formatRelativeAge(ageSeconds: number, lang: string): string {
	const formatter = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
	const minutes = Math.round(ageSeconds / 60);
	if (ageSeconds < 60) return formatter.format(0, "second");
	if (minutes < 60) return formatter.format(-minutes, "minute");
	const hours = Math.round(minutes / 60);
	if (hours < 24) return formatter.format(-hours, "hour");
	const days = Math.round(hours / 24);
	return formatter.format(-days, "day");
}
