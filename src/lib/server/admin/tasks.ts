import { and, eq } from "drizzle-orm";
import type { TaskInput } from "$lib/admin/task-actions";
import type { TaskRotation } from "$lib/schemas";
import { db } from "$lib/server/db";
import { lineupRotation, practiceSession, task, taskContribution, translationSourceSet } from "$lib/server/db/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function writeRotation(tx: Transaction, taskId: number, rotation: TaskRotation) {
	await tx.delete(lineupRotation).where(eq(lineupRotation.taskId, taskId));
	if (rotation !== "none") await tx.insert(lineupRotation).values({ taskId, kind: rotation });
}

export async function getTaskRotation(taskId: number): Promise<TaskRotation> {
	const [row] = await db.select({ kind: lineupRotation.kind }).from(lineupRotation).where(eq(lineupRotation.taskId, taskId)).limit(1);
	return row?.kind ?? "none";
}

export async function createTask(
	input: TaskInput,
	options: { createdBy: string; rotation: TaskRotation; isActive?: boolean; approveContributionId?: number },
) {
	return db.transaction(async (tx) => {
		const [created] = await tx
			.insert(task)
			.values({ ...input, createdBy: options.createdBy, isActive: options.isActive ?? true })
			.returning({ id: task.id });
		await writeRotation(tx, created.id, options.rotation);
		if (options.approveContributionId !== undefined) {
			const [approved] = await tx
				.update(taskContribution)
				.set({ status: "approved", reviewedBy: options.createdBy })
				.where(and(eq(taskContribution.id, options.approveContributionId), eq(taskContribution.status, "pending")))
				.returning({ id: taskContribution.id });
			if (!approved) throw new ContributionAlreadyReviewedError();
		}
		return created.id;
	});
}

export class ContributionAlreadyReviewedError extends Error {
	constructor() {
		super("Already reviewed");
	}
}

export async function updateTask(taskId: number, input: TaskInput, options: { rotation: TaskRotation; isActive?: boolean }) {
	await db.transaction(async (tx) => {
		await tx
			.update(task)
			.set(options.isActive === undefined ? input : { ...input, isActive: options.isActive })
			.where(eq(task.id, taskId));
		await writeRotation(tx, taskId, options.rotation);
	});
}

export type TaskDeletionResult = { deleted: true } | { deleted: false; message: string };

/** Deletes a task no learner has worked on; used tasks stay as inactive content. */
export async function deleteUnusedTask(taskId: number): Promise<TaskDeletionResult> {
	const [session] = await db.select({ id: practiceSession.id }).from(practiceSession).where(eq(practiceSession.taskId, taskId)).limit(1);
	const [sourceSet] = await db
		.select({ id: translationSourceSet.id })
		.from(translationSourceSet)
		.where(eq(translationSourceSet.taskId, taskId))
		.limit(1);
	if (session || sourceSet) return { deleted: false, message: "Learners have worked on this task. Deactivate it instead to preserve their history." };
	await db.delete(task).where(eq(task.id, taskId));
	return { deleted: true };
}
