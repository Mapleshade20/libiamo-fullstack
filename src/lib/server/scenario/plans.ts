import { and, eq } from "drizzle-orm";
import { db } from "#lib/server/db/index.ts";
import { scenarioPlan } from "#lib/server/db/schema.ts";

/* What a learner plans to say in a scenario, typed on its page before going in (design §5.3): kept per language until
   the piece is created, which takes it as its background. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const one = (userId: string, scenarioId: string, language: string) =>
	and(eq(scenarioPlan.userId, userId), eq(scenarioPlan.scenarioId, scenarioId), eq(scenarioPlan.language, language));

export async function planOf(userId: string, scenarioId: string, language: string): Promise<string> {
	const [p] = await db
		.select({ text: scenarioPlan.text })
		.from(scenarioPlan)
		.where(one(userId, scenarioId, language));
	return p?.text ?? "";
}

export async function savePlan(userId: string, scenarioId: string, language: string, text: string) {
	if (!text.trim()) return void (await db.delete(scenarioPlan).where(one(userId, scenarioId, language)));
	await db
		.insert(scenarioPlan)
		.values({ userId, scenarioId, language, text })
		.onConflictDoUpdate({ target: [scenarioPlan.userId, scenarioPlan.scenarioId, scenarioPlan.language], set: { text, updatedAt: new Date() } });
}

/** The plan, taken by the piece being created in `tx`. */
export async function takePlan(tx: Tx, userId: string, scenarioId: string, language: string): Promise<string | null> {
	const [p] = await tx
		.delete(scenarioPlan)
		.where(one(userId, scenarioId, language))
		.returning({ text: scenarioPlan.text });
	return p?.text.trim() || null;
}
