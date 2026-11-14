/**
 * Model results a revision asks for once and reuses, by key: the promise while it runs, the value once it has come
 * back. Only settled values go into a snapshot; one still running is asked for again after a reload if it is needed.
 */
export class Memo<T> {
	private live = new Map<string, Promise<T>>();
	readonly settled = new Map<string, T>();
	constructor(private readonly onSettle: () => void = () => {}) {}
	get(key: string) {
		return this.live.get(key);
	}
	set(key: string, p: Promise<T>) {
		this.live.set(key, p);
		p.then(
			(v) => {
				if (this.live.get(key) !== p) return;
				this.settled.set(key, v);
				this.onSettle();
			},
			() => {},
		);
		return this;
	}
	delete(key: string) {
		this.live.delete(key);
		this.settled.delete(key);
	}
	entries(): [string, T][] {
		return [...this.settled];
	}
	load(entries: [string, T][]) {
		for (const [k, v] of entries) {
			this.live.set(k, Promise.resolve(v));
			this.settled.set(k, v);
		}
		return this;
	}
}
