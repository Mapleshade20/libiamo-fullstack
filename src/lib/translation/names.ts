/* A work's name tables as the admin confirms them and the sources use them (server/translation/names.ts). */
export type Work = {
	id: string;
	title: string;
	wikidata?: string;
	/** MediaWiki APIs of the work's wikis, by language ("en" for the original's). */
	wikis?: { api: string; lang: string }[];
	/** Wikis a program cannot read (a bot check): links for the admin, {q} is the name. */
	manual?: { lang: string; name: string; search: string }[];
};
export type Candidate = { rendering: string; source: "wikidata" | "wikipedia" | "wiki"; url: string; about: string };
export type NameRow = {
	term: string;
	kind: "name" | "term";
	/** null: written as in the original. */
	rendering: string | null;
	status: "pending" | "confirmed";
	/** Where the rendering came from: a source, the model, or the admin. */
	origin: Candidate["source"] | "model" | "admin" | "none";
	url?: string;
	why?: string;
	candidates?: Candidate[];
};
export type NameTable = { work: string; locale: string; rows: NameRow[] };
