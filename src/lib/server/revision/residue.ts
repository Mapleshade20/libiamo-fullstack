// What must never be in a version that goes into the post: words the writer left in their own language, and the
// passages pass 1 left for the writer to decide (an untranslated clause, an "a/b" choice), copied back as they were.
// 2026-11-10: the vet put "愤怒" back into "hurt and angry", and "giving the answer" put it into the post.
import { words } from "#lib/text/words.ts";

const SCRIPTS: Record<string, RegExp> = {
	Han: /\p{Script=Han}/u,
	Kana: /[\p{Script=Hiragana}\p{Script=Katakana}]/u,
	Hangul: /\p{Script=Hangul}/u,
	Cyrillic: /\p{Script=Cyrillic}/u,
	Arabic: /\p{Script=Arabic}/u,
	Greek: /\p{Script=Greek}/u,
};
/** The non-Latin scripts each language is written in (Latin ones need none). */
const LANG_SCRIPTS: Record<string, string[]> = {
	"zh-CN": ["Han"],
	ja: ["Han", "Kana"],
	ko: ["Hangul", "Han"],
	ru: ["Cyrillic"],
	ar: ["Arabic"],
	el: ["Greek"],
};

/** Characters of a script the writer's language uses and the target language does not. */
function foreignScript(text: string, learner: string, target: string): string | null {
	const own = LANG_SCRIPTS[learner] ?? [];
	const ok = new Set(LANG_SCRIPTS[target] ?? []);
	for (const s of own) {
		if (ok.has(s)) continue;
		const m = text.match(new RegExp(`${SCRIPTS[s].source}+`, "gu"));
		if (m) return m[0];
	}
	return null;
}

const norm = (x: string) =>
	words(x.toLowerCase())
		.map((w) => w.w)
		.join(" ");

/**
 * The first thing in `version` that is residue, or null. `left`: passages pass 1 left as written for the writer. An
 * "a/b" choice is residue when it is still there whole. When the writer's language shares the target's script (an
 * English aside in a Spanish email), so is any run of three words of a left passage, unless the writer's own text
 * around the version has that run too. In another script, the script itself shows it (the English words of a passage
 * that mixes both are the target language, and may stay).
 */
export function residue(version: string, d: { learner: string; target: string }, left: string[] = [], around = ""): string | null {
	const s = foreignScript(version, d.learner, d.target);
	if (s) return s;
	const sameScript = !(LANG_SCRIPTS[d.learner] ?? []).some((x) => !(LANG_SCRIPTS[d.target] ?? []).includes(x));
	const v = ` ${norm(version)} `;
	const ctx = ` ${norm(around)} `;
	for (const l of left) {
		if (l.includes("/")) {
			if (version.includes(l.trim())) return l.trim();
			continue;
		}
		if (!sameScript) continue;
		const ws = norm(l).split(" ").filter(Boolean);
		for (let i = 0; i + 3 <= ws.length; i++) {
			const run = ` ${ws.slice(i, i + 3).join(" ")} `;
			if (v.includes(run) && !ctx.includes(run)) return ws.slice(i, i + 3).join(" ");
		}
	}
	return null;
}

/**
 * A run of four words or more that `version` adds and the text right next to it already has (`near`), or null:
 * "It's very cold at night. Could you… this week? It's very cold at night, so this can't wait." (2026-11-10).
 */
export function repeats(version: string, replaced: string, near: string): string | null {
	const v = norm(version).split(" ").filter(Boolean);
	const had = ` ${norm(replaced)} `;
	const ctx = ` ${norm(near)} `;
	for (let i = 0; i + 4 <= v.length; i++) {
		const run = v.slice(i, i + 4).join(" ");
		if (ctx.includes(` ${run} `) && !had.includes(` ${run} `)) return run;
	}
	return null;
}
