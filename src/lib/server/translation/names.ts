// How names are written in a translation scenario's source (user, 2026-11-08). A name with an established rendering in the
// learner's language (an official translation, a settled fan name) is written that way, as fans of that language
// write it: 褐皮, not Tawnypelt, in a Chinese text about Warriors. Mixing renderings and English names in one text is
// the fallback for what nobody could settle, not the aim. Models alone are not trusted with this (haiku wrote 玳瑁毛
// for 褐皮 and 猫战士, the Taiwan title, for 猫武士), so:
//
// 1. code looks each name up where people have written the renderings down: Wikidata labels per locale (zh-cn, never
//    the bare "zh", which is often Taiwan usage), Wikipedia's interlanguage links read in the locale's variant, and
//    the work's own wikis (interlanguage links, and a search of its wiki in that language);
// 2. a model only picks which candidate is this very thing, and proposes a rendering where nothing was found, or says
//    to keep the original;
// 3. the admin confirms every row of the work's table (wikis that refuse programs, such as the huiji Warriors wiki
//    behind a bot check, are search links for them); only confirmed rows reach a source.
import { z } from "zod";
import { type Caller, chatJson } from "#lib/server/llm/caller.ts";
import { LANG_NAMES, type Lang } from "#lib/server/revision/draft.ts";
import type { Term } from "#lib/server/translation/source.ts";
import type { Candidate, NameRow, Work } from "#lib/translation/names.ts";

const UA = "Libiamo/0.1 (translation scenario name lookup)";
/** How Wikimedia names a locale: the wiki, the script variant to read titles in, the label keys in order of trust. */
function wm(locale: Lang) {
	if (locale === "zh-CN") return { wiki: "zh", variant: "zh-cn", labels: ["zh-cn", "zh-hans"] };
	if (locale === "pt") return { wiki: "pt", variant: undefined, labels: ["pt", "pt-br"] };
	return { wiki: locale, variant: undefined, labels: [locale] };
}
const strip = (html: string) =>
	html
		.replace(/<[^>]+>/g, "")
		.replace(/&quot;/g, '"')
		.replace(/&amp;/g, "&")
		.replace(/&#39;/g, "'")
		.trim();

/** What the wiki APIs answer, as far as this file reads it. */
type Labels = Record<string, { value: string }>;
type WikiAnswer = {
	search?: { id: string }[];
	entities?: Record<string, { labels?: Labels; descriptions?: Labels }>;
	parse?: { displaytitle?: string };
	query?: {
		pages?: Record<string, { title: string; langlinks?: { "*": string }[]; pageprops?: Record<string, string> }>;
		search?: { title: string; snippet?: string }[];
	};
};

let last = 0;
/** One polite request: sequential, a little apart, ten seconds at most, never throws. */
async function get(url: string): Promise<WikiAnswer | null> {
	const wait = last + 250 - Date.now();
	if (wait > 0) await new Promise((r) => setTimeout(r, wait));
	last = Date.now();
	try {
		const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
		if (!r.ok) return null;
		return await r.json();
	} catch {
		return null;
	}
}
const qs = (o: Record<string, string>) => new URLSearchParams({ format: "json", ...o }).toString();

async function fromWikidata(term: string, locale: Lang): Promise<Candidate[]> {
	const { labels } = wm(locale);
	const s = await get(
		`https://www.wikidata.org/w/api.php?${qs({ action: "wbsearchentities", search: term, language: "en", type: "item", limit: "5" })}`,
	);
	const ids = (s?.search ?? []).map((x) => x.id);
	if (!ids.length) return [];
	const e = await get(
		`https://www.wikidata.org/w/api.php?${qs({ action: "wbgetentities", ids: ids.join("|"), props: "labels|descriptions", languages: ["en", ...labels].join("|") })}`,
	);
	const out: Candidate[] = [];
	for (const id of ids) {
		const it = e?.entities?.[id];
		const label = labels.map((k) => it?.labels?.[k]?.value).find(Boolean);
		if (label)
			out.push({
				rendering: label,
				source: "wikidata",
				url: `https://www.wikidata.org/wiki/${id}`,
				about: `${it?.labels?.en?.value ?? term}: ${it?.descriptions?.en?.value ?? ""}`,
			});
	}
	return out;
}

/** A page's title in the locale's wiki, read in its variant (zh-cn shows 猫武士 for the page titled 貓戰士). */
async function titleIn(api: string, title: string, variant?: string) {
	if (!variant) return title;
	const p = await get(`${api}?${qs({ action: "parse", page: title, prop: "displaytitle", variant })}`);
	return p?.parse?.displaytitle ? strip(p.parse.displaytitle) : title;
}

async function fromWikipedia(term: string, locale: Lang): Promise<Candidate[]> {
	const { wiki, variant } = wm(locale);
	const q = await get(
		`https://en.wikipedia.org/w/api.php?${qs({ action: "query", titles: term, redirects: "1", prop: "langlinks|pageprops", lllang: wiki })}`,
	);
	const page = Object.values(q?.query?.pages ?? {})[0];
	const link = page?.langlinks?.[0]?.["*"];
	if (!link) return [];
	const rendering = await titleIn(`https://${wiki}.wikipedia.org/w/api.php`, link, variant);
	return [
		{
			rendering,
			source: "wikipedia",
			url: `https://${wiki}.wikipedia.org/wiki/${encodeURIComponent(link)}`,
			about: `${page.title}: ${page.pageprops?.["wikibase-shortdesc"] ?? ""}`,
		},
	];
}

async function fromWorkWikis(term: string, locale: Lang, work: Work): Promise<Candidate[]> {
	const { wiki, variant } = wm(locale);
	const out: Candidate[] = [];
	const base = (api: string) => api.replace(/api\.php$/, "wiki/");
	for (const w of work.wikis ?? []) {
		if (w.lang === "en") {
			// The original's wiki, linking its page to the same page in the locale's language.
			const q = await get(`${w.api}?${qs({ action: "query", titles: term, redirects: "1", prop: "langlinks", lllang: wiki })}`);
			const page = Object.values(q?.query?.pages ?? {})[0];
			const link = page?.langlinks?.[0]?.["*"];
			if (link)
				out.push({
					rendering: link,
					source: "wiki",
					url: `${base(w.api)}${encodeURIComponent(page.title)}`,
					about: `${page.title} on the ${work.title} wiki, linked to its ${LANG_NAMES[locale]} page`,
				});
		} else if (w.lang === locale) {
			// The locale's own wiki: pages that mention the English name (a character page usually gives it).
			const s = await get(`${w.api}?${qs({ action: "query", list: "search", srsearch: `"${term}"`, srlimit: "3" })}`);
			for (const x of s?.query?.search ?? []) {
				const title = await titleIn(w.api, x.title, variant);
				out.push({
					rendering: title,
					source: "wiki",
					url: `${base(w.api)}${encodeURIComponent(x.title)}`,
					about: `a page of the ${LANG_NAMES[locale]} ${work.title} wiki mentioning "${term}": ${strip(x.snippet ?? "").slice(0, 160)}`,
				});
			}
		}
	}
	return out;
}

/** Every candidate rendering the sources give for a name, before anyone judges which is this very thing. */
export async function lookupName(term: string, locale: Lang, work?: Work): Promise<Candidate[]> {
	const all = [
		...(work ? await fromWorkWikis(term, locale, work) : []),
		...(await fromWikipedia(term, locale)),
		...(await fromWikidata(term, locale)),
	];
	// One candidate per rendering, from the first source that gave it (a work's wiki before Wikipedia and Wikidata).
	const seen = new Set<string>();
	return all.filter((c) => !seen.has(c.rendering) && seen.add(c.rendering));
}

const JudgeSchema = z.object({
	names: z.array(z.object({ term: z.string(), pick: z.number().nullable(), proposal: z.string().nullable(), why: z.string() })),
});

/**
 * Which candidate is this very thing (same work, same character or place), and for what no source gave, the rendering
 * this language's community has settled on, if the model knows one; otherwise the original stays.
 */
export async function judgeNames(original: string, context: string, terms: Term[], found: Candidate[][], locale: Lang, ai: Caller, work?: Work) {
	const L = LANG_NAMES[locale];
	const user = [
		`A text from ${context}${work ? ` (about ${work.title})` : ""}:`,
		"<<<",
		original,
		">>>",
		"",
		`It will be given to learners in ${L}. For each name and term below, decide how ${L}-speaking readers of this community write it. Candidates were found in Wikidata, Wikipedia and the work's wikis:`,
		...terms.map((t, i) =>
			[
				`${i + 1}. ${t.term} (${t.kind}): ${t.note}`,
				...(found[i].length ? found[i].map((c, k) => `   [${k}] ${c.rendering} (${c.source}: ${c.about})`) : ["   (no candidate)"]),
			].join("\n"),
		),
		"",
		`For each: pick is the number of the candidate that is this very thing (the same work, the same character, place or thing; not a namesake), else null. When no candidate fits, proposal is the rendering ${L}-speaking fans or readers actually use, only if you know an established one (an official translation, a name the community has settled on); never coin one. null when there is none or you are not sure: the original is then kept. why: one short line, in English (for a proposal, where the rendering comes from).`,
		'Reply with JSON only: {"names":[{"term":"","pick":null,"proposal":null,"why":""}]}',
	].join("\n");
	const r = (await chatJson([{ role: "user", content: user }], JudgeSchema, { ai, tag: "translate/names" })).value.names;
	return terms.map((t, i): NameRow => {
		const j = r.find((x) => x.term === t.term) ?? r[i];
		const c = j?.pick != null ? found[i][j.pick] : undefined;
		if (c)
			return {
				term: t.term,
				kind: t.kind,
				rendering: c.rendering,
				status: "pending",
				origin: c.source,
				url: c.url,
				why: j?.why,
				candidates: found[i],
			};
		if (j?.proposal?.trim())
			return { term: t.term, kind: t.kind, rendering: j.proposal.trim(), status: "pending", origin: "model", why: j.why, candidates: found[i] };
		return { term: t.term, kind: t.kind, rendering: null, status: "pending", origin: "none", why: j?.why, candidates: found[i] };
	});
}
