/*
 * A scenario's focused pages (its place, the after page, the translation sheet) are per language: each language has its
 * own unfinished piece. A link to one of them names the piece's language, which can be other than the one the account
 * is working in (a reply from a place in another language, a piece taken up again); without it the page takes the
 * account's.
 */
export type ScenarioPage = "play" | "after" | "translate";

export const scenarioHref = (scenarioId: string, to: ScenarioPage, lang?: string | null) =>
	`/scenario/${scenarioId}/${to}${lang ? `?lang=${encodeURIComponent(lang)}` : ""}`;

/** The language a focused scenario page is in: the link's, else the account's. */
export const scenarioLang = (url: { searchParams: { get(name: string): string | null } }, working: string) => url.searchParams.get("lang") || working;
