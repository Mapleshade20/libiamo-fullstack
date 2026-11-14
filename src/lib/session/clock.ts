/*
 * The session's pacing. Every wait belongs to one run (`gen`): leaving, or the debug panel jumping to another phase,
 * starts a new run, and every wait of the old one rejects with `Cancelled`, so nothing of it touches the page again.
 * Waits count real elapsed time, so throttled timers (a background tab) don't stretch the pacing.
 */
export class Cancelled extends Error {}

export const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Typing and the pauses around it run 15% slower than the first cut. */
export const SLOW = 1.15;
/** The tour plays sessions a little faster, and holds them while it is paused (lib/components/tour). */
export const pacing = { speed: 1, paused: false };

export class Clock {
	gen = 0;
	next() {
		return ++this.gen;
	}
	/** `movement`: a wait that only paces motion, skipped under reduced motion. */
	sleep(ms: number, { movement = false } = {}) {
		const my = this.gen;
		return new Promise<void>((resolve, reject) => {
			let left = ms;
			let last = performance.now();
			const tick = () => {
				if (my !== this.gen) return reject(new Cancelled());
				const now = performance.now();
				if (!pacing.paused) left -= (now - last) * pacing.speed;
				last = now;
				if (left <= 0 || (movement && reduced())) return resolve();
				setTimeout(tick, 16);
			};
			tick();
		});
	}
	/** A check for code that outlives an await: false once the run it started in is over. */
	alive() {
		const my = this.gen;
		return () => my === this.gen;
	}
	/** Resolves with `p`, or rejects with `Cancelled` if the run ended meanwhile. */
	async hold<T>(p: Promise<T>): Promise<T> {
		const alive = this.alive();
		const v = await p;
		if (!alive()) throw new Cancelled();
		return v;
	}
}
