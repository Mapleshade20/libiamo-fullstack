import { AsyncReplyWorker } from "$lib/server/async-replies/worker";

const worker = new AsyncReplyWorker({
	scanIntervalMs: Number(process.env.ASYNC_REPLY_WORKER_SCAN_MS ?? 1_000),
	leaseMs: Number(process.env.ASYNC_REPLY_WORKER_LEASE_MS ?? 30_000),
	concurrency: Number(process.env.ASYNC_REPLY_WORKER_CONCURRENCY ?? 2),
});

worker.start();
console.info(`async reply worker ${worker.id} started`);

const shutdown = async (signal: string) => {
	console.info(`async reply worker received ${signal}`);
	await worker.stop();
	process.exitCode = 0;
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
