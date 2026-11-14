import { eq } from "drizzle-orm";
import type { ExchangePlace, Urgency } from "#lib/constants.ts";
import type { ExchangeVersion } from "#lib/scenario/versions.ts";
import type { db } from "../db/index.ts";
import { exchange, piece, scenario } from "../db/schema.ts";

/*
 * What an exchange is played in: its scenario's place, pace and turn limit, and the version in the piece's language.
 * The old code read a task row with the counterpart's name and the members inside its opening; `openingState` keeps
 * that shape, filled from the version's people (the first is whom the learner answers), so the places and the floor
 * read who is there the way they always did.
 */
export type Setting = {
	/** The scenario: seeds the names code draws. */
	id: string;
	ui: ExchangePlace;
	language: string;
	title: string;
	openingState: Record<string, unknown>;
	urgency: Urgency;
	maxTurns: number | null;
	version: ExchangeVersion;
};

type Reader = Pick<typeof db, "select">;

/** The opening as the places and the floor read it: the version's opening with its people named. */
export function sceneOpening(v: Pick<ExchangeVersion, "opening" | "people">): Record<string, unknown> {
	const [first, ...rest] = v.people;
	return {
		...(v.opening as Record<string, unknown>),
		...(first ? { counterpartName: first.name } : {}),
		...(rest.length ? { members: rest.map((p) => p.name).join(", ") } : {}),
	};
}

export function settingFrom(row: typeof scenario.$inferSelect, language: string): Setting | null {
	const version = (row.versions as Record<string, ExchangeVersion>)[language];
	if (!version || row.kind !== "exchange") return null;
	return {
		id: row.id,
		ui: row.place as ExchangePlace,
		language,
		title: version.title,
		openingState: sceneOpening(version),
		urgency: (row.urgency as Urgency | null) ?? "high",
		maxTurns: row.maxTurns,
		version,
	};
}

export async function settingOf(tx: Reader, exchangeId: number): Promise<Setting> {
	const [r] = await tx
		.select({ s: scenario, language: piece.language })
		.from(exchange)
		.innerJoin(piece, eq(piece.id, exchange.pieceId))
		.innerJoin(scenario, eq(scenario.id, exchange.scenarioId))
		.where(eq(exchange.id, exchangeId));
	const setting = r ? settingFrom(r.s, r.language) : null;
	if (!setting) throw new Error("Exchange has no scenario");
	return setting;
}
