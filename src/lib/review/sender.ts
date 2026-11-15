/** A failed write pauses the queue. Retrying reuses the request's idempotency key, even after a lost response. */
export function ratingSender<T>(send: (job: T) => Promise<void>, changed: () => void) {
	const jobs: T[] = [];
	let running = false;
	let failed = false;
	async function drain() {
		if (running || failed) return;
		running = true;
		try {
			while (jobs.length) {
				await send(jobs[0]);
				jobs.shift();
				changed();
			}
		} catch {
			failed = true;
		} finally {
			running = false;
			changed();
		}
	}
	return {
		get failed() {
			return failed;
		},
		enqueue(job: T) {
			jobs.push(job);
			void drain();
		},
		retry() {
			failed = false;
			changed();
			void drain();
		},
	};
}
