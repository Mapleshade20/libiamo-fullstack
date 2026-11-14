import { applyEdits } from "../edits.ts";
import { type Draft, LANG_NAMES, type Lang } from "../fixtures/types.ts";
import type { ModelKey } from "../llm.ts";
import type { Finding } from "../pass1/strategies.ts";
import { config, readBack, sentences, spotRange } from "../pass2/analyze.ts";
import { feedback, grade, withAttempt } from "../pass2/grade.ts";
import { type Material, material, pieceOwnership } from "../pass2/material.ts";
import { detectSplit } from "../pipeline/detect.ts";
import { answerQuestion, closingReaction, contentCheck, inferScene, overviewReply, ownReading } from "./calls.ts";
import { rung as ladder, plain } from "./ladder.ts";
import type { Learner } from "./learner.ts";

export { applyEdits };

import { type Word, words } from "../words.ts";

/**
 * One thing the learner sees. `text` is the plain rendering (storyboards); `kind` and `data` let a live UI draw it richly.
 * kind "wait" marks a model call in progress (its text says what for); the next beat ends it.
 */
export type Beat = {
	phase: "scene" | "pass1" | "pass2" | "end";
	who: "tutor" | "reader" | "me" | "system" | "post";
	text: string;
	spot?: string;
	kind?: string;
	data?: unknown;
};
export type SessionInput = { title?: string; text: string; background?: string; learner: Lang; level: string };

/** The grading strategy that did best per model in E4. */
const GRADER: Record<ModelKey, "g2" | "g3"> = { luna: "g2", haiku: "g3", deepseek: "g3" };
const MAX_TRIES = 5;

/** A few words either side of a draft range, with the range marked, so a pass-1 item is never shown bare. */
function inContext(text: string, from: number, to: number): string {
	// Six words either side, counted by the segmenter, so text without spaces gets context too.
	const before = words(text.slice(0, from));
	const after = words(text.slice(to), to);
	const left = text.slice(before.at(-6)?.from ?? 0, from);
	const right = text.slice(to, after.at(6)?.to ?? text.length);
	const mid = from === to ? "（…）" : `「${text.slice(from, to)}」`;
	return `…${left}${from === to ? "" : " "}${mid}${right.startsWith(" ") ? "" : " "}${right}…`.replace(/\s+/g, " ");
}

type W = Word;
const wordsAt = (x: string, base = 0): W[] => words(x, base);

/**
 * The text an attempt replaces. Learners often rewrite a little more than the highlighted spot: the spot grows over the
 * words before it that the attempt starts with and the words after it that the attempt ends with (within the sentence),
 * and to the whole sentence when they wrote a full sentence for a spot covering most of it.
 */
export function scopeOf(text: string, target: string, attempt: string): string {
	const at = text.indexOf(target);
	if (at < 0) return target;
	const end = at + target.length;
	// The sentences the spot starts and ends in (a spot that ends on its own "?" ends that sentence).
	const ss = sentences(text, "en");
	const start = ss.find((x) => x.from <= at && at < x.to)?.from ?? at;
	const stop = ss.find((x) => x.from < end && end <= x.to)?.to ?? end;
	const a = wordsAt(attempt).map((x) => x.w);
	// A spot that is a whole sentence may be rewritten together with its neighbour in the same paragraph.
	const si = ss.findIndex((x) => x.from === start);
	const ei = ss.findIndex((x) => x.to === stop);
	const leadFrom = at === start && si > 0 && ss[si - 1].para === ss[si].para ? ss[si - 1].from : start;
	const tailTo = end === stop && ei >= 0 && ss[ei + 1]?.para === ss[ei].para ? ss[ei + 1].to : stop;
	const lead = wordsAt(text.slice(leadFrom, at), leadFrom);
	const tail = wordsAt(text.slice(end, tailTo), end);
	let from = at;
	let to = end;
	// The longest run of words before the spot that the attempt begins with (it may begin mid-way through that run).
	for (let k = Math.min(lead.length, a.length); k >= 1; k--) {
		const run = lead.slice(-k).map((x) => x.w);
		// A single word only counts when the attempt starts with it, right before the spot.
		const i = k === 1 ? (a[0] === run[0] ? 0 : -1) : a.indexOf(run[0]);
		if (i >= 0 && i <= 2 && run.every((w, n) => a[i + n] === w)) {
			from = lead[lead.length - k].from;
			break;
		}
		// Or it begins with the start of that run: a rewrite from the beginning of the sentence before. One shared word is
		// not enough ("Me sería…" after "¿Me puede decir…?" swallowed the question, 2026-11-10).
		if (
			(k >= 3 || (k >= 2 && k === lead.length)) &&
			a.slice(0, k).join(" ") ===
				lead
					.slice(0, k)
					.map((x) => x.w)
					.join(" ")
		) {
			from = lead[0].from;
			break;
		}
	}
	// The longest run of words just after the spot (starting within its first three words) that the attempt ends with.
	tailRun: for (let k = Math.min(tail.length, a.length); k >= 1; k--) {
		for (let j = 0; j <= (k === 1 ? 0 : Math.min(2, tail.length - k)); j++) {
			if (
				a.slice(-k).join(" ") ===
				tail
					.slice(j, j + k)
					.map((x) => x.w)
					.join(" ")
			) {
				to = tail[j + k - 1].to;
				break tailRun;
			}
		}
		if (
			k >= 2 &&
			a.slice(-k).join(" ") ===
				tail
					.slice(-k)
					.map((x) => x.w)
					.join(" ")
		) {
			to = tailTo;
			break;
		}
	}
	// The attempt carries the words that end the rest of the sentence (it may add to them): it rewrote up to there.
	const ending = tail.filter((x) => x.to <= stop).map((x) => x.w);
	if (to < stop && ending.length >= 3 && a.join(" ").includes(ending.slice(-3).join(" "))) to = stop;
	// A full sentence starts like one (a capital, or any start in a script without case); its end mark may be missing
	// (punctuation never decides).
	const sentenceWords = wordsAt(text.slice(start, stop)).length;
	const opens = /^[\p{Lu}“"(¿¡「『（]/u.test(attempt.trim()) || /^[^\p{Lu}\p{Ll}\s\p{P}]/u.test(attempt.trim());
	const full = opens && (/[.!?)”"。！？」]$/.test(attempt.trim()) || a.length >= 0.6 * sentenceWords);
	if (full && (end - at) / Math.max(1, stop - start) > 0.6) [from, to] = [Math.min(from, start), Math.max(to, stop)];
	// A full sentence that replaces up to the sentence's end takes the end punctuation with it.
	if (full && to < stop && /^[.!?]$/.test(text.slice(to, stop).trim())) to = stop;
	// An opening bracket the attempt does not start with stays in the post (its closing half is outside the spot).
	let out = text.slice(from, to).trim();
	if (/^[(（]/.test(out) && !/^[(（]/.test(attempt.trim()) && !/[)）]/.test(out)) out = out.slice(1).trimStart();
	return out;
}

/** The app's own words, in the learner's language. Everything the models write is already in it. */
const UI = {
	"zh-CN": {
		scene: (p: string, a: string, w: string, l: string) => `发在：${p}\n谁会读：${a}\n你想做的：${w}\n语言：${l}`,
		sceneQ: "我是这样理解你这篇的，对吗？",
		sceneOk: "对，开始",
		sceneNo: "场景不对",
		sceneFix: "哪里不对？说说这篇要发在哪、写给谁、想做什么。",
		reading: "正在通读你的草稿…",
		pickOne: (o: string) => `你在这里拿不准：${o}。选一个：`,
		right: "对。",
		useThis: (x: string) => `这里用 ${x.replace(/[.。]$/, "")}。`,
		hole: (t: string) => `你在这里留了一处，用${t}补上：`,
		fixHere: "这里有一处要改：",
		tryIt: "改一下试试：",
		skip: "（跳过）",
		typeHere: "把这里改掉，只写替换的词",
		deferred: "（放第二遍）",
		pass2Wait: "正在从读者的角度读你的帖子…",
		readerQ: "读者读懂你的意思了吗？",
		agree: "对，就是这个",
		disagree: "不完全是，我想说的是……",
		agreeSaid: "对，就是这个。",
		sayMeant: "说说你真正想表达的（用中文就行）",
		missing: "（没写）",
		toFix: "（要改）",
		gone: (id: string) => `（跳过 ${id}：它已在前面一处改写里一起改掉了）`,
		yes: "对",
		ownWords: "我自己说",
		many: (n: number) => `这里有 ${n} 处要一起看。`,
		nth: (k: number) => `第 ${k} 处：`,
		guess: (p: string, r: string) => `${p} 我理解的是：${r} 是这个意思吗？`,
		which: "你更接近哪个？",
		meantQ: "你想说的是？",
		sayOwn: "说说你在这里想表达什么（用中文就行）",
		notSaid: "（没说）",
		yesMeant: "对，就是这个意思。",
		hints: "提示",
		moreHint: "再给一点提示",
		giveAnswer: "直接给我答案",
		rungs: ["给你一个骨架", "再给你每个词的首字母", "整句是这样"],
		checkAgain: "再看看你想说的意思有没有说全。",
		skeleton: "给你一个骨架",
		given: "这一句先给你，记为没练，之后在复写里会再遇到。",
		refIntro: "参考说法是这样，每一处选择都在下面：",
		alsoSay: "也可以说：",
		useThisOne: "用这一句",
		ask: "我有疑问",
		useMine: "用我写的",
		useRef: "用参考说法",
		again: "再写一遍",
		nowWhat: "接下来？",
		askWhat: "想问什么？",
		goAgain: "好，再来一遍。",
		selfFound: "（自己发现了问题，重写）",
		checking: "发出去之前核对一下内容…",
		checkHead: "发出去之前核对一下：",
		allThere: "和改对后的版本比，你想说的都还在。",
		readerReacts: "读者正在读你的新帖子…",
		learned: (n: number, g: number) => `这次你自己搭了 ${n} 句${g ? `，${g} 句是直接给的` : ""}。明天起，这几个说法会换个场景让你再搭一次：`,
		preparing: "正在准备这一处…",
		grading: "读者在读你写的…",
		thinking: "老师在想…",
	},
	en: {
		scene: (p: string, a: string, w: string, l: string) => `Posting on: ${p}\nRead by: ${a}\nWhat you want to do: ${w}\nLanguage: ${l}`,
		sceneQ: "Is this how you see your post?",
		sceneOk: "Yes, start",
		sceneNo: "Not quite",
		sceneFix: "What's off? Where will it go, who reads it, what do you want it to do?",
		reading: "Reading your draft…",
		pickOne: (o: string) => `You weren't sure here: ${o}. Pick one:`,
		right: "Right. ",
		useThis: (x: string) => `Here it's ${x.replace(/[.。]$/, "")}. `,
		hole: (t: string) => `You left a gap here. Fill it in ${t}:`,
		fixHere: "Something to fix here:",
		tryIt: "Have a go:",
		skip: "(skipped)",
		typeHere: "Type only the words that replace it",
		deferred: " (for pass 2)",
		pass2Wait: "Reading your post the way a reader would…",
		readerQ: "Did the reader get what you meant?",
		agree: "Yes, that's it",
		disagree: "Not quite, I meant…",
		agreeSaid: "Yes, that's it.",
		sayMeant: "Say what you really meant (in English is fine)",
		missing: "(missing) ",
		toFix: "(to fix) ",
		gone: (id: string) => `(Skipping ${id}: it was rewritten together with an earlier spot.)`,
		yes: "Yes",
		ownWords: "In my own words",
		many: (n: number) => `${n} things to look at together here. `,
		nth: (k: number) => `${k}. `,
		guess: (p: string, r: string) => `${p} I take it you mean: ${r} Is that right?`,
		which: "Which is closer?",
		meantQ: "What did you mean?",
		sayOwn: "Say what you meant here (in English is fine)",
		notSaid: "(nothing)",
		yesMeant: "Yes, that's what I mean.",
		hints: "Hints",
		moreHint: "A bit more help",
		giveAnswer: "Just show me",
		rungs: ["Here's the skeleton", "Now the first letters", "Here's the whole sentence"],
		checkAgain: "Check whether you've said everything you meant.",
		skeleton: "Here's the skeleton",
		given: "Here it is. It's marked as not practised; you'll meet it again later.",
		refIntro: "Here's a reference version, with every choice explained:",
		alsoSay: "Also: ",
		useThisOne: "Use this",
		ask: "I have a question",
		useMine: "Use mine",
		useRef: "Use the reference",
		again: "Write it again",
		nowWhat: "Now what?",
		askWhat: "What's your question?",
		goAgain: "OK, once more.",
		selfFound: "(found a problem myself, rewriting)",
		checking: "Checking your content before you post…",
		checkHead: "Before you post, check these:",
		allThere: "Everything you meant is still there.",
		readerReacts: "A reader is reading your new post…",
		learned: (n: number, g: number) =>
			`You built ${n} of these yourself${g ? ` (${g} given)` : ""}. From tomorrow you'll rebuild these in new settings:`,
		preparing: "Preparing this spot…",
		grading: "The reader is reading what you wrote…",
		thinking: "The tutor is thinking…",
	},
};

export async function runSession(input: SessionInput, model: ModelKey, learner: Learner, log: (b: Beat) => void, opts: { grader?: ModelKey } = {}) {
	// Grading sits between every attempt and its feedback; haiku answers in a steady ~7 s where deepseek's tail reaches 40 s (E4).
	const graderModel = opts.grader ?? model;
	const L = input.learner;
	const U = UI[L as keyof typeof UI] ?? UI.en;
	const say = (phase: Beat["phase"], who: Beat["who"], text: string, spot?: string, kind?: string, data?: unknown) =>
		log({ phase, who, text, spot, kind, data });
	const wait = (phase: Beat["phase"], label: string, spot?: string) => say(phase, "system", label, spot, "wait");

	// Scene. The learner may correct it; the correction goes in as part of their note.
	say("scene", "post", input.text, undefined, "post", { text: input.text });
	wait("scene", U.reading);
	let background = input.background;
	let scene = await inferScene(input.text, background, L, "native", model);
	for (let round = 0; ; round++) {
		say(
			"scene",
			"system",
			U.scene(scene.platform, scene.audience, scene.purpose, `${LANG_NAMES[L]} → ${LANG_NAMES[scene.target]}`),
			undefined,
			"scene",
			scene,
		);
		const ok = await learner.choose(
			"The app inferred this about your post:\n" + `${scene.platform}; readers: ${scene.audience}; purpose: ${scene.purpose}`,
			"Is that right?",
			[U.sceneOk, U.sceneNo],
			U.sceneQ,
		);
		say("scene", "me", ok === 0 ? `${U.sceneOk} →` : U.sceneNo);
		if (ok === 0 || round >= 2) break;
		const fix = await learner.say("The app's guess about where your post goes and why is wrong.", "Say what is wrong with it.", U.sceneFix);
		if (!fix) break;
		say("scene", "me", fix);
		background = [background, fix].filter(Boolean).join("\n");
		wait("scene", U.reading);
		scene = await inferScene(input.text, background, L, "native", model);
	}
	const d: Draft = {
		id: "session",
		title: input.title,
		text: input.text,
		background,
		target: scene.target,
		learner: L,
		level: input.level,
		scene: { platform: scene.platform, audience: scene.audience, purpose: scene.purpose },
	};

	// Detection: pass 1 (native-first rewrite) and the pass-2 analysis (v6, fresh native) run at once; pass 1 starts as
	// soon as its own part is ready, and pass 2 keeps working while the learner goes through it.
	config.task = "v6";
	const det = detectSplit(d, model, 0);
	wait("pass1", U.reading);
	const p1all = (await det.pass1).findings;
	const p1 = p1all.filter((f): f is Finding & { after: string } => f.pass === 1 && f.after !== undefined).sort((a, b) => a.from - b.from);
	const defers = p1all.filter((f) => f.pass === 2);

	// Pass 1.
	say("pass1", "post", d.text, undefined, "post", { text: d.text, marks: p1.map((f) => ({ from: f.from, to: f.to })) });
	const applied: { from: number; to: number; after: string }[] = [];
	for (const f of p1) {
		const label = `「${f.before || "∅"}」`;
		const item = { from: f.from, to: f.to, before: f.before, after: f.after, note: f.note, kind: f.kind };
		const options =
			f.kind === "hesitation"
				? f.before
						.split("/")
						.map((x) => x.trim())
						.filter(Boolean)
				: [];
		if (options.length > 1 && options.some((o) => o.toLowerCase() === f.after.toLowerCase())) {
			say("pass1", "tutor", U.pickOne(options.join(" / ")), label, "p1-ask", { ...item, mode: "pick", options });
			const pick = await learner.choose(
				`In your post you wrote "${f.before}".`,
				"Which one do you think is right here?",
				options,
				U.pickOne(options.join(" / ")),
			);
			const right = options[pick].toLowerCase() === f.after.toLowerCase();
			say("pass1", "me", options[pick], label);
			say("pass1", "tutor", `${right ? U.right : U.useThis(f.after)}${f.note}`, label, "p1-done", { ...item, right });
		} else if (f.try || f.kind === "hole") {
			const where = inContext(d.text, f.from, f.to);
			const ask = f.prompt ?? (f.kind === "hole" ? U.hole(LANG_NAMES[d.target]) : U.fixHere);
			say("pass1", "tutor", `${ask}\n${where}\n${U.tryIt}`, label, "p1-ask", { ...item, mode: "try", prompt: ask, context: where });
			const t =
				(await learner.say(
					`In your post: ${where}\nThe tutor says: ${f.prompt ?? ""}`,
					`Type, in ${LANG_NAMES[d.target]}, only the ${LANG_NAMES[d.target]} words that should replace 「${f.before || "…"}」 in your post (never an explanation, never ${LANG_NAMES[L]}).`,
					U.typeHere,
				)) ?? "";
			say("pass1", "me", t || U.skip, label);
			const norm = (x: string) =>
				x
					.trim()
					.replace(/[.!?]$/, "")
					.replace(/’/g, "'")
					.toLowerCase();
			const right = [f.after, ...(f.accept ?? [])].some((x) => norm(x) === norm(t));
			say("pass1", "tutor", `${right ? U.right : U.useThis(f.after)}${f.note}`, label, "p1-done", { ...item, right, typed: t });
		} else {
			say("pass1", "tutor", `${inContext(d.text, f.from, f.to)} → 「${f.after}」：${f.note}`, label, "p1-told", {
				...item,
				context: inContext(d.text, f.from, f.to),
			});
		}
		applied.push(f);
	}
	for (const f of defers)
		say("pass1", "tutor", `「${f.before}」：${f.note}${U.deferred}`, undefined, "p1-defer", {
			from: f.from,
			to: f.to,
			before: f.before,
			note: f.note,
		});
	const { text: pass1Text, map } = applyEdits(d.text, applied);
	say("pass1", "post", pass1Text, undefined, "post", { text: pass1Text });

	// Pass 2: the reader reads the whole post first.
	let text = pass1Text;
	wait("pass2", U.pass2Wait);
	const [rbCall, p2] = await Promise.all([readBack(d, text, model, 0), det.pass2]);
	const rb = rbCall.text.trim();
	say("pass2", "reader", rb);
	const agree = await learner.choose(`A reader of your post replied: "${rb}"`, "Did they get what you meant?", [U.agree, U.disagree], U.readerQ);
	let said: string | null = null;
	if (agree === 1)
		said = await learner.say(`A reader of your post replied: "${rb}"`, "Say what you actually meant (in your own language is fine).", U.sayMeant);
	say("pass2", "me", said ?? U.agreeSaid);
	wait("pass2", U.thinking);
	const ov = await overviewReply(d, text, rb, p2.analysis.gist, said, model);
	say("pass2", "tutor", ov.reply);
	say(
		"pass2",
		"tutor",
		p2.analysis.map
			.map((m) => `${m.status === "missing" ? U.missing : m.status === "fix" ? U.toFix : ""}${m.role}：${m.what}${m.note ? ` — ${m.note}` : ""}`)
			.join("\n"),
		undefined,
		"map",
		p2.analysis.map,
	);

	// Spots, located in the draft by code and carried into the pass-1 text by the edit map.
	const ss = sentences(d.text, d.target);
	// Spot ranges are positions in the current text, moved by code after every edit (never re-found by searching).
	type Part = { problem: string; question?: string; mode: "one" | "ask"; readings: { label: string; meaning: string }[] };
	type Spot = { id: string; from: number; to: number; parts: Part[]; gone?: boolean; pre?: Promise<Material> };
	// A spot whose stumbling words pass 1 already rewrote entirely has nothing left to ask (both passes see the draft).
	// Either pass 1 rewrote all of the quoted words, or it touched them and the words the problem is about are gone.
	const fixedByPass1 = (quote?: string | null, problem = "") => {
		const at = quote ? d.text.indexOf(quote) : -1;
		if (at < 0) return false;
		const words = wordsAt(quote!, at);
		const inHunk = (w: W) => applied.some((f) => f.from <= w.from && w.to <= f.to);
		if (words.length && words.every(inHunk)) return true;
		const named = Array.from(problem.matchAll(/['‘"“«「]([^'’"”»」]{2,40})['’"”»」]/g), (m) => m[1].trim());
		const gone = named.some((n) => d.text.toLowerCase().includes(n.toLowerCase()) && !pass1Text.toLowerCase().includes(n.toLowerCase()));
		return words.some(inHunk) && gone;
	};
	const found = p2.analysis.spots
		.map((s) => {
			const [from, to] = spotRange(d.text, ss, s);
			return {
				from: map(from, "from"),
				to: map(to, "to"),
				ok: from >= 0,
				fixed: fixedByPass1(s.quote, s.problem),
				part: { problem: s.problem, question: s.question ?? undefined, mode: s.mode, readings: s.readings },
			};
		})
		.filter((s) => s.ok && !s.fixed && !!pass1Text.slice(s.from, s.to).trim());
	if (ov.newSpot && text.includes(ov.newSpot.where)) {
		const at = text.indexOf(ov.newSpot.where);
		found.push({
			from: at,
			to: at + ov.newSpot.where.length,
			ok: true,
			fixed: false,
			part: { problem: ov.newSpot.problem, question: undefined, mode: "one", readings: [{ label: U.yesMeant, meaning: ov.newSpot.reading }] },
		});
	}
	// Overlapping spots become one stop: the learner rewrites a stretch of text once, with every problem in it in view (E8).
	const queue: Spot[] = [];
	for (const f of [...found].sort((x, y) => x.from - y.from || y.to - x.to)) {
		const last = queue.at(-1);
		if (last && f.from < last.to) {
			last.to = Math.max(last.to, f.to);
			last.parts.push(f.part);
		} else queue.push({ id: `spot${queue.length + 1}`, from: f.from, to: f.to, parts: [f.part] });
	}
	say(
		"pass2",
		"system",
		queue.map((q) => text.slice(q.from, q.to)).join("\n"),
		undefined,
		"spots",
		queue.map((q) => ({ id: q.id, from: q.from, to: q.to })),
	);

	/** Everything a stop needs to ask for its material; the default readings let the next stop be prepared early. */
	const prep = (spot: Spot, meanings: string[]) => {
		const anchor = text.slice(spot.from, spot.to).trim();
		const sentence =
			sentences(text, d.target)
				.filter((x) => text.slice(x.from, x.to).includes(anchor.slice(0, 40)))
				.map((x) => x.text)
				.join(" ") || anchor;
		const many = spot.parts.length > 1;
		const problem = many ? spot.parts.map((p, i) => `${i + 1}. ${p.problem}`).join("\n") : spot.parts[0].problem;
		const reading = many ? meanings.map((x, i) => `${i + 1}. ${x}`).join("\n") : meanings[0];
		return {
			anchor,
			problem,
			reading,
			make: () =>
				material(d, text, { sentences: sentence, phrase: anchor, problem, reading, mode: spot.parts[0].mode }, model, 0).then((r) => r.value),
		};
	};
	const defaults = (spot: Spot) => spot.parts.map((p) => p.readings[0]?.meaning ?? p.problem);
	const prefetch = (spot: Spot | undefined) => {
		if (!spot || spot.gone || spot.pre) return;
		spot.pre = prep(spot, defaults(spot)).make();
		spot.pre.catch(() => {});
	};
	prefetch(queue[0]);

	const learned: { construct: string; self: boolean }[] = [];
	const decided: string[] = [];
	for (const [qi, spot] of queue.entries()) {
		if (spot.gone) {
			say("pass2", "system", U.gone(spot.id), spot.id);
			continue;
		}
		const meanings = defaults(spot);
		let { anchor, problem, reading, make } = prep(spot, meanings);
		const many = spot.parts.length > 1;
		say("pass2", "post", `【标蓝】${anchor}`, spot.id, "post", { text, mark: { from: spot.from, to: spot.to } });
		wait("pass2", U.preparing, spot.id);
		// The learner reads the question while the material for every other reading is written (single-problem stops).
		const byReading = new Map<string, Promise<Material>>([[reading, spot.pre ?? make()]]);
		if (!many)
			for (const r of spot.parts[0].readings.slice(1)) {
				const alt = prep(spot, [r.meaning]);
				const pr = alt.make();
				pr.catch(() => {});
				byReading.set(alt.reading, pr);
			}
		let m: Material = await byReading.get(reading)!;
		say("pass2", "reader", m.reader, spot.id);
		let changed = false;
		for (const [k, part] of spot.parts.entries()) {
			const labels = part.readings.map((r) => r.label);
			const options = part.mode === "one" ? [U.yes, ...labels.slice(1), U.ownWords] : [...labels, U.ownWords];
			const head = many ? `${k === 0 ? U.many(spot.parts.length) : ""}${U.nth(k + 1)}` : "";
			const line = part.mode === "one" ? `${head}${U.guess(part.problem, meanings[k])}` : `${head}${part.problem} ${part.question ?? U.which}`;
			say("pass2", "tutor", line, spot.id, "ask-reading", {
				problem: part.problem,
				question: part.question,
				mode: part.mode,
				readings: part.readings,
				guess: meanings[k],
			});
			say("pass2", "system", `选项：${options.join(" ｜ ")}`, spot.id, "options");
			const pick = await learner.choose(
				`The app is asking about this part of your post: "${anchor}"\nProblem: ${part.problem}\nReadings: ${part.readings.map((r) => `${r.label}: ${r.meaning}`).join("; ")}`,
				"What did you mean?",
				options,
				part.mode === "one" ? U.guess("", meanings[k]).trim() : (part.question ?? U.which),
			);
			const chosen = options[pick];
			if (chosen === U.ownWords) {
				const own = await learner.say(
					`The part of your post: "${anchor}". Problem: ${part.problem}`,
					"Say what you meant there (your own language is fine).",
					U.sayOwn,
				);
				say("pass2", "me", own ?? U.notSaid, spot.id);
				if (own) {
					wait("pass2", U.thinking, spot.id);
					const r = await ownReading(d, text, anchor, part.problem, own, model);
					meanings[k] = r.reading;
					say("pass2", "tutor", r.reply, spot.id);
					changed = true;
				}
			} else {
				say("pass2", "me", chosen === U.yes ? U.yesMeant : `${chosen}：${part.readings[pick]?.meaning ?? ""}`, spot.id);
				if (pick > 0 && part.readings[pick]) {
					meanings[k] = part.readings[pick].meaning;
					changed = true;
				}
			}
		}
		if (changed) {
			({ anchor, problem, reading, make } = prep(spot, meanings));
			wait("pass2", U.preparing, spot.id);
			m = await (byReading.get(reading) ?? make());
		}
		// While the learner writes, prepare the next stop.
		prefetch(queue.slice(qi + 1).find((q) => !q.gone));
		const pieces = m.pieces.map((p) => ({ text: p, own: pieceOwnership(text, p) === "own" }));
		say("pass2", "tutor", `${m.prompt}\n${U.hints}：${pieces.map((p) => `${p.own ? "■" : "□"} ${p.text}`).join("  ")}`, spot.id, "pieces", {
			prompt: m.prompt,
			pieces,
		});

		const history: { text: string; feedback: string }[] = [];
		const seen = new Set<number>();
		let rungN = 0;
		let round = 0;
		let mine: string | null = null;
		let gave = false;
		let scope = text.includes(m.replaces) ? m.replaces : anchor;
		let ticks: number[] = [];
		let ownNote: string | null = null;
		let final = "";
		let rewrites = 0;
		for (;;) {
			// Write until it passes, the learner asks for the answer, or the ladder runs out.
			for (let tries = 0; ; ) {
				const a = await learner.attempt({
					post: text,
					original: anchor,
					reading,
					prompt: m.prompt,
					pieces: m.pieces,
					rung: rungN ? ladder(m.ref, rungN, d.target) : undefined,
					history,
				});
				if ("hint" in a) {
					rungN = Math.min(3, rungN + 1);
					say("pass2", "me", U.moreHint, spot.id);
					say("pass2", "tutor", `${U.rungs[rungN - 1]}：${ladder(m.ref, rungN, d.target)}`, spot.id, "rung", {
						level: rungN,
						lead: U.rungs[rungN - 1],
						text: ladder(m.ref, rungN, d.target),
					});
					if (rungN === 3) {
						gave = true;
						break;
					}
					continue;
				}
				if ("give" in a || tries >= MAX_TRIES) {
					gave = true;
					say("pass2", "me", U.giveAnswer, spot.id);
					break;
				}
				tries++;
				say("pass2", "me", a.text, spot.id);
				scope = scopeOf(text, text.includes(m.replaces) ? m.replaces : anchor, a.text);
				wait("pass2", U.grading, spot.id);
				const g = (
					await grade(
						d,
						text,
						{ reading, problem, material: { ...m, replaces: scope }, attempt: a.text, earlier: history.map((h) => h.text) },
						graderModel,
						{ strategy: GRADER[graderModel] },
					)
				).value;
				if (g.verdict === "pass") {
					say("pass2", "reader", m.success, spot.id);
					mine = a.text;
					ticks = g.ticks;
					ownNote = g.own ?? null;
					break;
				}
				round++;
				const fb = feedback(m, g, round);
				const key = g.check ?? -1;
				if (fb?.reader && !seen.has(key)) say("pass2", "reader", fb.reader, spot.id);
				seen.add(key);
				const line = fb?.tutor || g.errors.map((e) => `${e.words} → ${e.fix}：${e.why}`).join("\n") || U.checkAgain;
				if (round === 2 && rungN === 0) {
					rungN = 1;
					say("pass2", "tutor", line, spot.id);
					say("pass2", "tutor", `${U.skeleton}：${ladder(m.ref, 1, d.target)}`, spot.id, "rung", {
						level: 1,
						lead: U.skeleton,
						text: ladder(m.ref, 1, d.target),
					});
				} else say("pass2", "tutor", line, spot.id);
				history.push({ text: a.text, feedback: line });
			}
			const why = m.why.map((w, i) => ({ ...w, ok: !gave && ticks.includes(i + 1) }));
			say(
				"pass2",
				"tutor",
				[
					gave ? U.given : U.refIntro,
					`  ${plain(m.ref)}`,
					...(m.alts.length ? [`${U.alsoSay}${m.alts.join(" / ")}`] : []),
					...why.map((w) => `${w.ok ? "✓" : "→"} ${w.label}　${w.note}`),
					...(ownNote ? [ownNote] : []),
				].join("\n"),
				spot.id,
				"ref",
				{ gave, intro: gave ? U.given : U.refIntro, ref: m.ref, alts: m.alts, why, own: ownNote, mine },
			);

			const choices = gave ? [U.useThisOne, U.ask] : [U.useMine, U.useRef, U.ask];
			let pick = choices[await learner.choose(`Your version: "${mine ?? ""}". Reference: "${plain(m.ref)}"`, "What now?", choices, U.nowWhat)];
			if (pick === U.ask) {
				const q = await learner.say(
					`Your version: "${mine ?? ""}". Reference: "${plain(m.ref)}". Explanation given above.`,
					"What do you want to ask the tutor about this sentence?",
					U.askWhat,
				);
				let retry = false;
				if (q) {
					say("pass2", "me", q, spot.id);
					wait("pass2", U.thinking, spot.id);
					const ans = await answerQuestion(d, text, m, mine, q, { reading, problem, history }, model);
					say("pass2", "tutor", ans.answer, spot.id);
					if (ans.kind === "ref" && ans.revisedRef) m = { ...m, ref: ans.revisedRef };
					retry = ans.kind === "meaning" && !!mine;
				}
				const after = [...choices.filter((c) => c !== U.ask), ...(retry && rewrites < 2 ? [U.again] : [])];
				pick = after[await learner.choose("After the tutor's answer:", "What now?", after, U.nowWhat)];
			}
			say("pass2", "me", pick, spot.id);
			if (pick === U.again) {
				rewrites++;
				say("pass2", "tutor", U.goAgain, spot.id);
				if (mine) history.push({ text: mine, feedback: U.selfFound });
				mine = null;
				continue;
			}
			final = pick === U.useMine && mine ? mine : plain(m.ref);
			// Whoever wrote it (learner or reference), align the final text with the post the same way.
			scope = scopeOf(text, text.includes(m.replaces) ? m.replaces : anchor, final);
			break;
		}
		// Replace near the spot and move every other spot's range by the change.
		const at = Math.max(text.indexOf(scope, Math.max(0, spot.from - scope.length)), 0);
		const end = at + scope.length;
		const next = withAttempt(text.slice(0, at) + "\u0000" + text.slice(end), "\u0000", final);
		const delta = next.length - text.length;
		for (const o of queue) {
			if (o === spot || o.gone) continue;
			if (o.to <= at) continue;
			if (o.from >= end) {
				o.from += delta;
				o.to += delta;
			} else if (o.from >= at && o.to <= end) o.gone = true;
			else {
				o.from = Math.min(o.from, at);
				o.to = Math.max(o.to, end) + delta;
				o.pre = undefined;
			}
		}
		text = next;
		learned.push({ construct: m.construct, self: !gave });
		decided.push(`「${anchor}」→ ${reading}`);
		const rev = Math.max(0, text.indexOf(final, Math.max(0, at - 2)));
		say("pass2", "post", text, spot.id, "post", { text, revised: { from: rev, to: rev + final.length } });
	}

	// End: protect the writer's content before they post, then the reader reacts.
	wait("end", U.checking);
	const issues = await contentCheck(d, pass1Text, text, decided, model);
	say(
		"end",
		"tutor",
		issues.length ? `${U.checkHead}\n${issues.map((x) => `· [${x.kind}] 「${x.quote}」 ${x.note}`).join("\n")}` : U.allThere,
		undefined,
		"check",
		issues,
	);
	wait("end", U.readerReacts);
	const closing = await closingReaction(d, text, model);
	say("end", "post", text, undefined, "post", { text, final: true });
	say("end", "reader", closing);
	const self = learned.filter((x) => x.self).length;
	say(
		"end",
		"tutor",
		`${U.learned(self, learned.length - self)}\n${learned.map((x) => `${x.self ? "•" : "◦"} ${x.construct}`).join("\n")}`,
		undefined,
		"learned",
		learned,
	);
	return { text, scene, issues };
}
