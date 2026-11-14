import type { Beat } from "./run.ts";

const WHO: Record<Beat["who"], string> = { tutor: "✏️ 语言老师", reader: "📖 读者", me: "🙋 我", system: "⚙︎", post: "📄 帖子" };
const PHASE: Record<Beat["phase"], string> = { scene: "场景", pass1: "第一遍 · 改对", pass2: "第二遍 · 改好", end: "收尾" };

/** What the learner would see, in order, as markdown. */
export function storyboard(title: string, beats: Beat[], meta: string): string {
	let md = `# ${title}\n\n${meta}\n`;
	let phase = "";
	let spot: string | undefined;
	for (const b of beats) {
		if (b.kind === "wait" || b.kind === "spots") continue;
		if (b.phase !== phase) {
			md += `\n## ${PHASE[b.phase]}\n`;
			phase = b.phase;
			spot = undefined;
		}
		if (b.spot && b.spot !== spot && b.phase === "pass2") {
			md += `\n### ${b.spot}\n`;
			spot = b.spot;
		}
		const body = b.text.trim();
		if (b.who === "post")
			md += `\n${WHO.post}\n\n${body
				.split("\n")
				.map((l) => `> ${l}`)
				.join("\n")}\n`;
		else if (b.who === "reader") md += `\n**${WHO.reader}** *${body.replace(/\n+/g, " ")}*\n`;
		else md += `\n**${WHO[b.who]}** ${body.includes("\n") ? `\n\n${body}` : body}\n`;
	}
	return md;
}
