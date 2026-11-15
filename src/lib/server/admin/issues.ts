import { asc, desc, eq } from "drizzle-orm";
import type { Version } from "#lib/scenario/versions.ts";
import { db } from "#lib/server/db/index.ts";
import { issue, issueScenario, scenario } from "#lib/server/db/schema.ts";
import { isCurrent } from "#lib/server/scenario/rank.ts";

/*
 * Issues as the admin edits them: a themed handful of four to six scenarios with a date, its title and line keyed by
 * interface language (the editor writes the English; other languages it has are kept), its cover's colours.
 */
export type IssueState = "scheduled" | "current" | "past";
export type AdminIssue = {
	id: string;
	date: string;
	title: Record<string, string>;
	line: Record<string, string>;
	tone: string;
	deep: string;
	scenarios: { id: string; title: string }[];
	state: IssueState;
};

const stateOf = (date: string, now = new Date()): IssueState =>
	Date.parse(`${date}T12:00:00Z`) > now.getTime() ? "scheduled" : isCurrent(date, now) ? "current" : "past";
const titleOf = (versions: unknown) => {
	const v = versions as Record<string, Version>;
	return (v.en ?? Object.values(v)[0])?.title ?? "";
};

export async function adminIssues(): Promise<AdminIssue[]> {
	const [rows, members] = await Promise.all([
		db.select().from(issue).orderBy(desc(issue.date)),
		db
			.select({ issueId: issueScenario.issueId, id: scenario.id, versions: scenario.versions })
			.from(issueScenario)
			.innerJoin(scenario, eq(scenario.id, issueScenario.scenarioId))
			.orderBy(asc(issueScenario.position)),
	]);
	return rows.map((r) => ({
		id: r.id,
		date: r.date,
		title: r.title as Record<string, string>,
		line: r.line as Record<string, string>,
		tone: r.tone,
		deep: r.deep,
		scenarios: members.filter((m) => m.issueId === r.id).map((m) => ({ id: m.id, title: titleOf(m.versions) })),
		state: stateOf(r.date),
	}));
}

export type IssueInput = { id: string; date: string; title: string; line: string; tone: string; deep: string; scenarios: string[] };

/** Saves an issue whole; a new one needs a free id. */
export async function saveIssue(input: IssueInput, isNew: boolean) {
	await db.transaction(async (tx) => {
		const [was] = await tx.select().from(issue).where(eq(issue.id, input.id));
		if (isNew && was) throw new Error(`There is already an issue called ${input.id}.`);
		const title = { ...((was?.title as Record<string, string>) ?? {}), en: input.title };
		const line = { ...((was?.line as Record<string, string>) ?? {}), en: input.line };
		const set = { date: input.date, title, line, tone: input.tone, deep: input.deep };
		await tx
			.insert(issue)
			.values({ id: input.id, ...set })
			.onConflictDoUpdate({ target: issue.id, set });
		await tx.delete(issueScenario).where(eq(issueScenario.issueId, input.id));
		await tx.insert(issueScenario).values(input.scenarios.map((scenarioId, position) => ({ issueId: input.id, scenarioId, position })));
	});
}

export async function deleteIssue(id: string) {
	await db.delete(issue).where(eq(issue.id, id));
}
