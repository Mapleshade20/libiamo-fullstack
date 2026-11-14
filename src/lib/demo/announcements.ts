import { app, read, write } from "./app.svelte";

/* Stand-ins for the main app's announcements (written per interface language). */
type Local = Record<string, string>;
export type Announcement = { id: number; date: Date; title: Local; body: Local };
export const ANNOUNCEMENTS: Announcement[] = [
	{
		id: 7,
		date: new Date(2026, 9, 29),
		title: { en: "Collect phrases from what you read", "zh-CN": "现在可以从阅读里收词了" },
		body: {
			en: "Switch the box to “Collect”, paste something you read, and highlight what you want to keep. It goes straight into your notebook, and comes back in review.\n\nAsk about any phrase you keep: other ways to use it, real examples, how formal it is.",
			"zh-CN":
				"把输入框切到“收词”，贴入你读到的文字，划出想收下的部分。它会直接进入本子，之后在复习里出现。\n\n收下的每个表达都可以追问：别的用法、真实例句、正式程度。",
		},
	},
	{
		id: 6,
		date: new Date(2026, 9, 20),
		title: { en: "Your week, not your streak", "zh-CN": "按周计，而不是连续天数" },
		body: {
			en: "Practice now counts by the week: pick how many days you want to write, and missing a day never resets anything.",
			"zh-CN": "练习现在按周计算：你自己定每周练几天，错过一天也不会清零。",
		},
	},
];

const READ = "announcementsRead";
export const readIds = () => {
	void app.version;
	return new Set(read<number[]>(READ, [6]));
};
export function markRead(id: number) {
	write(READ, [...readIds(), id]);
	app.touch();
}
export function markAllUnread() {
	localStorage.removeItem(READ);
	app.touch();
}
/** An announcement's text in the interface language, else the learner's own, else English. */
export const local = (o: Local) => o[app.lang] ?? o[app.prefs.native] ?? o.en;
export const dateOf = (d: Date) => new Intl.DateTimeFormat(app.lang, { month: "short", day: "numeric" }).format(d);
