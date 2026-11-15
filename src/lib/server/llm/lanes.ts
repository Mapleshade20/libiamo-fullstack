/*
 * A revision's model calls while it runs, and the background lane that calls made ahead of need wait in. Every call runs on the learner's own key, whose provider caps how many
 * requests run at once, so guesses at what comes next go two at a time while calls the learner waits for never queue.
 * A queued guess the learner turns out to need is promoted and goes at once; one found unneeded is discarded and
 * never starts (one already running finishes and is marked discarded).
 */

export type CallState = "queued" | "running" | "done" | "cached" | "failed" | "discarded";
/** A call while its revision runs (what it is for, and how far it got). */
export type LiveCall = {
	id: number;
	purpose: string;
	tag: string;
	model: string;
	state: CallState;
	t0: number;
	ms?: number;
	error?: string;
	/** Made ahead of need: it waits its turn behind the revision's other guesses. */
	bg?: boolean;
};

export class Discarded extends Error {
	constructor() {
		super("discarded before it started");
		this.name = "Discarded";
	}
}

type Waiter = { call: LiveCall; go: (counted: boolean) => void; stop: () => void };
let next = 0;

export class Lanes {
	readonly calls: LiveCall[] = [];
	private busy = 0;
	private queue: Waiter[] = [];
	/** Purposes the learner has asked for: their later calls (a JSON repair) skip the lane too. */
	private promoted = new Set<string>();
	constructor(readonly width = 2) {}

	begin(purpose: string, tag: string, model: string, bg: boolean): LiveCall {
		const call: LiveCall = {
			id: ++next,
			purpose,
			tag,
			model,
			state: "running",
			t0: Date.now(),
			...(bg && !this.promoted.has(purpose) ? { bg: true } : {}),
		};
		this.calls.push(call);
		if (this.calls.length > 400) this.calls.shift();
		return call;
	}
	finish(call: LiveCall, patch: Partial<LiveCall>) {
		// A call already known to be unneeded stays discarded, with its timing filled in.
		const state = call.state === "discarded" ? "discarded" : patch.state;
		Object.assign(call, patch, { state, ms: patch.ms ?? Date.now() - call.t0 });
	}
	/** Wait for the call's turn (at once, unless it is a guess and the lane is full); returns the release. */
	async gate(call: LiveCall): Promise<() => void> {
		if (!call.bg) return () => {};
		// A turn is counted when it is given, not when the waiter wakes: release hands turns out in a loop.
		let counted = true;
		if (this.busy < this.width) this.busy++;
		else {
			call.state = "queued";
			counted = await new Promise<boolean>((go, stop) => this.queue.push({ call, go, stop: () => stop(new Discarded()) }));
			call.t0 = Date.now();
			call.state = "running";
		}
		return () => {
			if (counted) this.busy--;
			while (this.busy < this.width && this.queue.length) {
				this.busy++;
				this.queue.shift()?.go(true);
			}
		};
	}
	/** The learner is now waiting for these: queued calls whose purpose matches leave the lane and start. */
	promote(match: (purpose: string) => boolean) {
		for (const c of this.calls) if (c.bg && match(c.purpose)) this.promoted.add(c.purpose);
		for (const w of this.queue.filter((w) => match(w.call.purpose))) {
			this.queue.splice(this.queue.indexOf(w), 1);
			w.call.bg = false;
			// Out of the lane: it holds no turn, so its release gives none back.
			w.go(false);
		}
	}
	/** The calls whose purpose matches are not needed (guesses that lost, a superseded detection). */
	discard(match: (purpose: string) => boolean) {
		for (const c of this.calls) {
			if (c.state === "failed" || c.state === "discarded" || !match(c.purpose)) continue;
			const queued = this.queue.find((w) => w.call === c);
			c.state = "discarded";
			if (queued) {
				this.queue.splice(this.queue.indexOf(queued), 1);
				queued.stop();
			}
		}
	}
}
