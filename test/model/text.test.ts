import assert from "node:assert/strict";
import { test } from "vitest";
import { align } from "$model/diff.ts";
import { sentences, spotRange } from "$model/pass2/analyze.ts";
import { withAttempt } from "$model/pass2/grade.ts";
import { rebracket } from "$model/pass2/material.ts";
import { applyEdits, scopeOf } from "$model/session/run.ts";

const broken = "Wow... The way you wrote Brokenstar’s inner dialogue explains so well how he manipulated his clanmates. It makes so much sense.";

test("an attempt that rewrites the whole sentence replaces the whole sentence, not just the spot", () => {
	const target = "The way you wrote Brokenstar’s inner dialogue explains";
	const attempt = "Brokenstar’s inner dialogue explains so well how he manipulated his clanmates.";
	const scope = scopeOf(broken, target, attempt);
	assert.equal(scope, "The way you wrote Brokenstar’s inner dialogue explains so well how he manipulated his clanmates.");
	assert.equal(
		withAttempt(broken, scope, attempt),
		"Wow... Brokenstar’s inner dialogue explains so well how he manipulated his clanmates. It makes so much sense.",
	);
});

test("a fragment attempt replaces only the spot", () => {
	const text = "Darkpaw was at the Moonstone and 这件事让他又痛苦又愤怒.";
	assert.equal(scopeOf(text, "and 这件事让他又痛苦又愤怒", ", which left him hurt and angry"), "and 这件事让他又痛苦又愤怒");
});

test("pure insertions get spaces and deletions leave no double space", () => {
	const r = applyEdits("a bit regret and didn’t go for another try on", [
		{ from: 5, to: 5, after: "of" },
		{ from: 24, to: 38, after: "" },
	]);
	assert.equal(r.text, "a bit of regret and didn’t try on");
});

test("withAttempt keeps paragraph breaks and opening brackets tight", () => {
	assert.equal(withAttempt("One.\n\nTwo three.", "Two three.", "Four five."), "One.\n\nFour five.");
	assert.equal(withAttempt("(Could someone tell me?)", "Could someone tell me?", "Has anyone seen it?"), "(Has anyone seen it?)");
});

test("an attempt that overlaps the words after the spot replaces them too", () => {
	const text = "The effort you put into Yellowfang and Brokentail’s interactions in his final days adds so much depth to her.";
	const attempt = "Brokenstar’s interactions with Yellowfang in his final days";
	const scope = scopeOf(text, "Yellowfang and Brokentail’s", attempt);
	assert.equal(
		withAttempt(text, scope, attempt),
		"The effort you put into Brokenstar’s interactions with Yellowfang in his final days adds so much depth to her.",
	);
});

test("a full sentence for a spot ending before the period does not leave a stray period", () => {
	const text = "But Brambleclaw is a different case imo—which environment he grows up in hugely matters. He leads.";
	const attempt = "The environment Brambleclaw grows up in makes a huge difference to him.";
	const scope = scopeOf(text, "which environment he grows up in hugely matters", attempt);
	assert.equal(scope, "which environment he grows up in hugely matters.");
});

test("a single repeated word at either edge of the spot is absorbed", () => {
	const text =
		"Great. Especially, the canon-divergent ending struck me. And the effort you put into Yellowfang and Brokentail’s interactions adds depth.";
	const a1 = "Especially, the canon-divergent ending moved me more";
	assert.equal(
		withAttempt(text, scopeOf(text, "the canon-divergent ending struck me", a1), a1),
		"Great. Especially, the canon-divergent ending moved me more. And the effort you put into Yellowfang and Brokentail’s interactions adds depth.",
	);
	const a2 = "Yellowfang and Brokenstar’s interactions";
	assert.equal(
		withAttempt(text, scopeOf(text, "Yellowfang and Brokentail’s", a2), a2),
		"Great. Especially, the canon-divergent ending struck me. And the effort you put into Yellowfang and Brokenstar’s interactions adds depth.",
	);
});

test("a reference sentence for a phrase-sized spot replaces the sentence", () => {
	const text = "Intro! The prompts are inspiring and a lot of them have the potential to develop into amazing long fics! Your writing is great.";
	const ref = "The prompts are inspiring and a lot of them could grow into amazing long fics!";
	assert.equal(
		withAttempt(text, scopeOf(text, "have the potential to develop into", ref), ref),
		"Intro! The prompts are inspiring and a lot of them could grow into amazing long fics! Your writing is great.",
	);
});

test("an edit that would glue two words gets a space", () => {
	const text = "he grows up in hugely matters.";
	const r = applyEdits(text, [
		{ from: text.indexOf("hugely"), to: text.indexOf("hugely") + 6, after: "" },
		{ from: text.indexOf("."), to: text.indexOf(".") + 1, after: "hugely." },
	]);
	assert.equal(r.text, "he grows up in matters hugely.");
});

test("a v6 spot anchors on its quote and widens by scope", () => {
	const text = "First one. Tho I love them so much and surely someone helps? Last one.";
	const ss = sentences(text, "en");
	const at = (r: [number, number]) => text.slice(...r);
	assert.equal(at(spotRange(text, ss, { sentences: [1], quote: "Tho I love", scope: "words" })), "Tho I love");
	assert.equal(
		at(spotRange(text, ss, { sentences: [1], quote: "Tho I love", scope: "sentence" })),
		"Tho I love them so much and surely someone helps?",
	);
	assert.equal(
		at(spotRange(text, ss, { sentences: [2, 3], quote: "Tho I love", scope: "sentences" })),
		"Tho I love them so much and surely someone helps? Last one.",
	);
});

test("a spot ending in its own question mark does not swallow the next question", () => {
	const text = "Intro. (Could someone tell me if any book has a cloudy night at the Moonstone? Or does StarClan clear the clouds?)\n\nEnd.";
	const target = "(Could someone tell me if any book has a cloudy night at the Moonstone?";
	const a = "Could someone tell me if any other book has a cat at the Moonstone on a cloudy night?";
	assert.equal(
		withAttempt(text, scopeOf(text, target, a), a),
		"Intro. (Could someone tell me if any other book has a cat at the Moonstone on a cloudy night? Or does StarClan clear the clouds?)\n\nEnd.",
	);
});

test("an attempt that repeats the sentence before a whole-sentence spot absorbs it", () => {
	const text = "Body text here.\n\nGreat work! Kudos attached~";
	const a = "Great work! I left kudos on this chapter~";
	assert.equal(withAttempt(text, scopeOf(text, "Kudos attached~", a), a), "Body text here.\n\nGreat work! I left kudos on this chapter~");
});

test("a period before a continuing comma is dropped", () => {
	assert.equal(
		withAttempt("Para mí eso es una bandera roja, pero no sé.", "Para mí eso es una bandera roja", "Para mí es una señal de alarma."),
		"Para mí es una señal de alarma, pero no sé.",
	);
});

test("the end mark never depends on whether the learner typed it", () => {
	const text = "Sin embargo, cuando lo dije él se veía muy incómodo/nervioso. ¿Estuvo mal mencionarlo?";
	const want = "Sin embargo, cuando lo dije él pareció muy cohibido. ¿Estuvo mal mencionarlo?";
	assert.equal(withAttempt(text, "se veía muy incómodo/nervioso", "pareció muy cohibido"), want);
	assert.equal(withAttempt(text, "se veía muy incómodo/nervioso", "pareció muy cohibido."), want);
	// A capital the sentence does not need goes; a span that ended its sentence keeps its mark.
	assert.equal(withAttempt(text, "se veía muy incómodo/nervioso", "Pareció muy cohibido"), want);
	const two = "Hola. Mencioné algo más mejor. Adiós.";
	assert.equal(withAttempt(two, "Mencioné algo más mejor.", "mencioné que veo la serie"), "Hola. Mencioné que veo la serie. Adiós.");
	assert.equal(withAttempt(two, "Mencioné algo más mejor.", "¿Mencioné la serie?"), "Hola. ¿Mencioné la serie? Adiós.");
});

test("Japanese spans are placed without spaces and keep their end mark", () => {
	assert.equal(withAttempt("今日は雨です。明日は晴れ。", "明日は晴れ。", "明日は晴れるでしょう"), "今日は雨です。明日は晴れるでしょう。");
});

test("a whole-sentence rewrite is recognised without its end mark", () => {
	const text = "Hola. Cuando yo estaba hablando con él mencioné que veo la serie para entender mejor. Sin embargo, él se veía raro.";
	const attempt = "Hablando con él, le mencioné que veo la serie para entender mejor el español";
	assert.equal(
		withAttempt(text, scopeOf(text, "Cuando yo estaba hablando con él", attempt), attempt),
		"Hola. Hablando con él, le mencioné que veo la serie para entender mejor el español. Sin embargo, él se veía raro.",
	);
});

test("positions after a deletion that takes its space map to the same words", () => {
	const text = "Yellowfang and Brokentail’s interactions. Especially the ending.";
	const r = applyEdits(text, [{ from: 15, to: 27, after: "" }]);
	assert.equal(r.text, "Yellowfang and interactions. Especially the ending.");
	const at = text.indexOf("Especially");
	assert.equal(r.text.slice(r.map(at, "from"), r.map(at + 10, "to")), "Especially");
});

test("a rewrite that only straightens quotes, or marks the words for pass 2, changes nothing in pass 1", () => {
	const o = "Yellowfang and Brokentail’s interactions in his final days.";
	assert.deepEqual(align(o, "Yellowfang and ⟦Brokentail's⟧ interactions in his final days.", "en").hunks, []);
	assert.deepEqual(align(o, "Yellowfang and Brokentail's interactions in his final days.", "en").hunks, []);
	assert.deepEqual(
		align(o, "Yellowfang and Brokenstar’s interactions in his final days.", "en").hunks.map((h) => [h.before, h.after]),
		[["Brokentail’s", "Brokenstar’s"]],
	);
	// A straight apostrophe splits the word differently; the change is still one change, in the writer's apostrophes.
	assert.deepEqual(
		align(o, "Yellowfang and Brokenstar's interactions in his final days.", "en").hunks.map((h) => [h.before, h.after]),
		[["Brokentail’s", "Brokenstar’s"]],
	);
});

test("a repaired version keeps to the learner's stretch even when the grader copies the rest of the post in", async () => {
	const { within } = await import("$model/session/live.ts");
	const text =
		"Wow... The way you wrote Brokenstar’s inner dialogue explains so well how he manipulated his clanmates for his own ambition and hunger for power. It makes so much sense.";
	const scope = "The way you wrote Brokenstar’s inner dialogue explains so well how he manipulated his clanmates";
	const repaired =
		"You wrote Brokenstar's inner dialogue so beautifully that you can see how he manipulated his clanmates for his own ambition and hunger for power. It makes so much sense.";
	assert.equal(
		within(repaired, text, scope),
		"You wrote Brokenstar's inner dialogue so beautifully that you can see how he manipulated his clanmates",
	);
	assert.equal(within("Short and fine", text, scope), "Short and fine");
});

test("text without spaces: an attempt for most of a Japanese sentence replaces the sentence", () => {
	const text = "昨日は友達と映画を見に行きました。映画はとても面白いでした。また行きたいです。";
	const scope = scopeOf(text, "とても面白いでした", "映画はとても面白かったです");
	assert.equal(scope, "映画はとても面白いでした。");
});

test("text without spaces: a fragment attempt for a Japanese phrase replaces only the phrase", () => {
	const text = "昨日は友達と映画を見に行きました。映画はとても面白いでした。また行きたいです。";
	assert.equal(scopeOf(text, "面白いでした", "面白かったです"), "面白いでした");
});

test("text without spaces: a hint piece made only of the writer's own Japanese words is theirs", async () => {
	const { pieceOwnership } = await import("$model/pass2/material.ts");
	const draft = "昨日は友達と映画を見に行きました。";
	assert.equal(pieceOwnership(draft, "友達と映画"), "own");
	assert.equal(pieceOwnership(draft, "楽しかった"), "new");
});

test("rebracket marks the old key words again only when the revised reference lost every bracket", () => {
	assert.equal(rebracket("he tells her and feels grateful", "he [tells] her and [feels] [grateful]"), "he [tells] her and [feels] [grateful]");
	assert.equal(rebracket("he [says] it", "he [tells] it"), "he [says] it");
});

test("rebracket matches whole words", () => {
	assert.equal(rebracket("the man and he", "[he] said"), "the man and [he]");
});

test("a stop inside a larger one is marked first; the larger one once it is done", async () => {
	const { shown } = await import("$model/session/live.ts");
	const inner = { id: "s2", from: 10, to: 20 };
	const outer = { id: "s3", from: 0, to: 40 };
	const same = { id: "s4", from: 0, to: 40 };
	assert.deepEqual(
		shown([inner, outer, same]).map((s) => s.id),
		["s2"],
	);
	assert.deepEqual(
		shown([{ ...inner, done: true }, outer, same]).map((s) => s.id),
		["s3"],
	);
	assert.deepEqual(
		shown([{ ...inner, done: true }, { ...outer, done: true }, same]).map((s) => s.id),
		["s4"],
	);
});

test("a change that deletes the spaces around a kept word still makes the rewrite, and positions map back", () => {
	const o = "Hot red wine (no alcohol version): cinnamon, orange skin and clove.";
	const rewrite = "Mulled wine (alcohol-free): cinnamon, orange peel and cloves.";
	const r = applyEdits(o, align(o, rewrite, "en").hunks);
	assert.equal(r.text, rewrite);
	const at = r.text.indexOf("cinnamon");
	assert.equal(o.slice(r.inv(at, "from"), r.inv(at + 8, "to")), "cinnamon");
	assert.equal(o.slice(r.inv(r.text.indexOf("peel"), "from"), r.inv(r.text.indexOf("peel") + 4, "to")), "skin");
});

test("a deleted edge space stays out of a change whose replacement already brings one, so touching changes keep their space", () => {
	const o = "and rewrite many years' setting for a CP, his complicated and emotional relationship with";
	const rewrite = "and rewrites years of lore for a CP, his complicated, emotional relationships with";
	const r = applyEdits(o, align(o, rewrite, "en").hunks);
	assert.equal(r.text, rewrite);
	// Each change still reads as one: the learner's own fix for it is trimmed and must not lose a space either.
	const h = align(o, rewrite, "en").hunks.find((x) => x.before.startsWith("complicated"));
	assert.equal(h?.before, "complicated and");
});

test("a rewrite that shares only its first word with the sentence before does not take that sentence", () => {
	const text =
		"Mi novia viene conmigo.\n\n¿Me puede decir cuándo empiezan los cursos? Necesito una respuesta antes de fin de mes porque tengo que comprar el vuelo. Estoy seguro.";
	const target = "Necesito una respuesta antes de fin de mes porque tengo que comprar el vuelo.";
	assert.equal(scopeOf(text, target, "Me sería de ayuda recibir su respuesta antes de fin de mes, ya que tengo que comprar el vuelo."), target);
});

test("changes one word apart that add or drop a word are one change; two swapped words stay two", () => {
	const ch = (o: string, r: string) => align(o, r, "en").hunks.map((h) => `${h.before} → ${h.after}`);
	assert.deepEqual(ch("Is it possible to know?", "Would it be possible to know?"), ["Is it → Would it be"]);
	assert.deepEqual(ch("When it can be fixed?", "When can it be fixed?"), ["it can → can it"]);
	assert.deepEqual(ch("She have the apple.", "She has the apples."), ["have → has", "apple. → apples."]);
});
