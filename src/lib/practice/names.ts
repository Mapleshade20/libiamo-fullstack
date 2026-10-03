/**
 * Passers-by of open scenes, named the way each platform's users name themselves. Code picks the
 * names because models name people like mascots (TechieTom, BoardGameBuff42).
 */

import type { UiVariant } from "$lib/constants";

const ADJECTIVES = "Ok Fit Slight Mean Lazy Hot Grand Sad Lost Odd Late Low Pale Sharp Plain Weird Tidy Loose Calm Dry Keen Quiet Rare Warm".split(
	" ",
);
const NOUNS =
	"Wasabi Commercial Funny Bet Pumpkin Garage Wallaby Carpet Lemon Ferret Plane Muffin Pickle Radish Button Island Letter Engine Novel Yogurt Hawk Kettle Onion".split(
		" ",
	);
const WORDS =
	"mosswood tinfoil kestrel brine gravel okapi quince sprocket marrow tundra bramble fennel gouda pylon dingo lumen ratchet saffron cobble mango juniper static parsnip walrus cinder flint otter basalt nimbus clove".split(
		" ",
	);
const NICKS = "dan kat ollie jess mo rob sam vee tom nina raf lu ben iz fred ana jo max".split(" ");
// Japanese communities mostly go by kana or kanji nicknames.
const JA_NICKS = "たぬき もち ゆず こはる しろくま みかん つばめ あおい はるさめ くるみ そら ねこまる ぽん太 りんご 抹茶 こたつ いくら ひよこ".split(
	" ",
);

type Draw = () => number;

const one = <T>(list: readonly T[], draw: Draw) => list[Math.floor(draw() * list.length)];
const digits = (draw: Draw, count: number) => String(Math.floor(draw() * 10 ** count)).padStart(count, "0");
const title = (word: string) => word[0].toUpperCase() + word.slice(1);

const STYLES: Partial<Record<UiVariant, Array<(draw: Draw) => string>>> = {
	// A third of Reddit users keep the generated Adjective-Noun-1234; the rest picked a handle.
	reddit: [
		(d) => `${one(ADJECTIVES, d)}-${one(NOUNS, d)}-${digits(d, 4)}`,
		(d) => `${one(ADJECTIVES, d)}_${one(NOUNS, d)}_${digits(d, 4)}`,
		(d) => `${one(WORDS, d)}${one(WORDS, d)}`,
		(d) => `${one(WORDS, d)}${digits(d, 2)}`,
		(d) => `${title(one(WORDS, d))}${title(one(WORDS, d))}`,
		(d) => `${one(NICKS, d)}_${one(WORDS, d)}`,
	],
	ao3: [
		(d) => `${one(WORDS, d)}_${one(WORDS, d)}`,
		(d) => `${title(one(WORDS, d))}${title(one(NOUNS, d))}`,
		(d) => `${one(WORDS, d)}${digits(d, 3)}`,
		(d) => `${one(NICKS, d)}${one(WORDS, d)}`,
	],
	discord: [
		(d) => one(WORDS, d),
		(d) => `${one(NICKS, d)}${digits(d, 2)}`,
		(d) => `${one(WORDS, d)}.${one(WORDS, d)}`,
		(d) => `${one(NICKS, d)}_${one(WORDS, d)}`,
		(d) => title(one(NICKS, d)),
	],
};

const JA_STYLES: Array<(draw: Draw) => string> = [
	(d) => one(JA_NICKS, d),
	(d) => `${one(JA_NICKS, d)}${digits(d, 2)}`,
	(d) => `${one(NICKS, d)}_${digits(d, 3)}`,
];

/** `count` distinct names in the platform's and language's style, none of them already `taken`. */
export function passersBy(ui: UiVariant, language: string, draw: Draw, count: number, taken: Iterable<string> = []): string[] {
	const styles = language === "ja" ? JA_STYLES : (STYLES[ui] ?? STYLES.discord ?? []);
	const seen = new Set([...taken].map((name) => name.toLowerCase()));
	const names: string[] = [];
	for (let tries = 0; names.length < count && tries < count * 20; tries += 1) {
		const name = one(styles, draw)(draw);
		if (seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		names.push(name);
	}
	return names;
}
