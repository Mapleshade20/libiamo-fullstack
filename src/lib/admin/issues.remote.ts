import { z } from "zod";
import { adminIssues, deleteIssue, saveIssue } from "#lib/server/admin/issues.ts";
import { admin } from "#lib/server/guard.ts";
import { command, query } from "$app/server";

/* The admin's issues. */
export const issueList = query(async () => {
	admin();
	return adminIssues();
});

const Colour = z.string().regex(/^#[0-9a-f]{6}$/i);
export const saveOneIssue = command(
	z.object({
		isNew: z.boolean(),
		issue: z.object({
			id: z.string().regex(/^[a-z0-9-]{2,60}$/),
			date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
			title: z.string().trim().min(1).max(120),
			line: z.string().trim().max(300),
			tone: Colour,
			deep: Colour,
			scenarios: z.array(z.string().max(60)).min(4).max(6),
		}),
	}),
	async ({ isNew, issue }) => {
		admin();
		try {
			await saveIssue(issue, isNew);
		} catch (e) {
			return { ok: false as const, error: (e as Error).message };
		}
		await issueList().refresh();
		return { ok: true as const };
	},
);

export const deleteOneIssue = command(z.string().max(60), async (id) => {
	admin();
	await deleteIssue(id);
	await issueList().refresh();
});
