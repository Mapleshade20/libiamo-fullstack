import { sql } from "drizzle-orm";
import { db } from "$lib/server/db";
import { type ClaimedCell, processCell } from "./runs";
import { purgeExpiredTraces } from "./traces";

export const DEFAULT_LAB_CONCURRENCY = 3;
/** Cells normally start on `wake()`; the slow scan only recovers work after a restart or lost lease. */
const RECOVERY_SCAN_MS = 15_000;
const PURGE_INTERVAL_MS = 60 * 60 * 1000;
/** Generous: Generation 1 and feedback calls can take minutes, and a judge call follows. */
const LEASE_MS = 10 * 60 * 1000;
const MAX_CELL_ATTEMPTS = 3;

/**
 * Runs LLM Lab cells in the web server process, like the agent-reply worker: claims with
 * `FOR UPDATE SKIP LOCKED`, fences writes by attempt count, and resumes after restarts.
 */
export class LabWorker {
	private timer: ReturnType<typeof setInterval> | undefined;
	private purgeTimer: ReturnType<typeof setInterval> | undefined;
	private readonly active = new Set<Promise<void>>();
	private filling: Promise<void> | undefined;
	private stopping = false;

	constructor(private readonly concurrency = DEFAULT_LAB_CONCURRENCY) {}

	start(): void {
		if (this.timer) return;
		this.stopping = false;
		this.timer = setInterval(() => this.wake(), RECOVERY_SCAN_MS);
		this.purgeTimer = setInterval(() => {
			purgeExpiredTraces().catch((error) => console.error("LLM Lab trace purge failed", error));
		}, PURGE_INTERVAL_MS);
		this.wake();
	}

	async stop(): Promise<void> {
		this.stopping = true;
		clearInterval(this.timer);
		clearInterval(this.purgeTimer);
		this.timer = undefined;
		this.purgeTimer = undefined;
		await this.filling;
		await Promise.allSettled([...this.active]);
	}

	/** Claims cells up to the concurrency limit. Safe to call often. */
	wake(): void {
		if (this.stopping || this.filling) return;
		const filling = this.fill()
			.catch((error) => console.error("LLM Lab worker failed to claim cells", error))
			.finally(() => {
				if (this.filling === filling) this.filling = undefined;
			});
		this.filling = filling;
	}

	private async fill(): Promise<void> {
		while (!this.stopping && this.active.size < this.concurrency) {
			const cell = await this.claim();
			if (!cell) return;
			let job!: Promise<void>;
			job = this.run(cell).finally(() => {
				this.active.delete(job);
				this.wake();
			});
			this.active.add(job);
		}
	}

	private async run(cell: ClaimedCell): Promise<void> {
		try {
			await processCell(cell);
		} catch (error) {
			console.error(`LLM Lab cell ${cell.id} failed`, error);
		}
	}

	private async claim(): Promise<ClaimedCell | null> {
		const leaseUntil = new Date(Date.now() + LEASE_MS).toISOString();
		// Cells whose lease expired too often are given up rather than retried forever.
		await db.execute(sql`
			UPDATE llm_run_cell SET status = 'failed', error = 'Gave up after repeated interruptions.', lease_until = NULL, claim_token = NULL, completed_at = now()
			WHERE status = 'running' AND lease_until < now() AND attempts >= ${MAX_CELL_ATTEMPTS}
		`);
		const rows = (await db.execute(sql`
			UPDATE llm_run_cell SET status = 'running', lease_until = ${leaseUntil}::timestamptz, claim_token = gen_random_uuid(), attempts = attempts + 1
			WHERE id = (
				SELECT id FROM llm_run_cell
				WHERE status = 'pending' OR (status = 'running' AND lease_until < now())
				ORDER BY id
				FOR UPDATE SKIP LOCKED
				LIMIT 1
			)
			RETURNING id, claim_token
		`)) as unknown as Array<{ id: number; claim_token: string }>;
		const row = rows[0];
		return row ? { id: row.id, claimToken: row.claim_token } : null;
	}
}
