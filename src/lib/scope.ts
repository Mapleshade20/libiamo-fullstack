/*
 * State that belongs to the learner a page is rendered for (their settings, their account, their pieces). In the
 * browser there is one learner, so one of each; on the server every request has its own, so one learner's state never
 * renders into another's page. hooks.server.ts hands `perRequest` where a request keeps its own.
 */
type Bag = Map<object, unknown>;
const one: Bag = new Map();
let bag: () => Bag = () => one;

/** Where the state of the request being served is kept (the server's hooks call this once). */
export function perRequest(source: () => Bag) {
	bag = source;
}

/** An object made once per learner: in the browser once, on the server once per request. */
export function learnerState<T extends object>(make: () => T): T {
	const key = {};
	const get = (): T => {
		const b = bag();
		let v = b.get(key) as T | undefined;
		if (!v) {
			v = make();
			b.set(key, v);
		}
		return v;
	};
	return new Proxy({} as T, {
		get: (_, k) => Reflect.get(get(), k),
		set: (_, k, v) => Reflect.set(get(), k, v),
		has: (_, k) => Reflect.has(get(), k),
		ownKeys: () => Reflect.ownKeys(get()),
		getOwnPropertyDescriptor: (_, k) => {
			const d = Reflect.getOwnPropertyDescriptor(get(), k);
			return d && { ...d, configurable: true };
		},
	});
}
