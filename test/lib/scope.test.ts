import { afterEach, assert, test } from "vitest";
import { learnerState, perRequest } from "#lib/scope.ts";

/* State that belongs to a learner is one per request on the server: two requests rendered at once never share it. */
const browserBag = new Map<object, unknown>();
afterEach(() => perRequest(() => browserBag));

class Prefs {
	lang = "en";
	get rtl() {
		return this.lang === "ar";
	}
	set(l: string) {
		this.lang = l;
	}
}

test("each request has its own, made on first use", () => {
	const prefs = learnerState(() => new Prefs());
	const a = new Map<object, unknown>();
	const b = new Map<object, unknown>();
	let current = a;
	perRequest(() => current);
	prefs.set("ar");
	assert.equal(prefs.lang, "ar");
	assert.isTrue(prefs.rtl);
	current = b;
	assert.equal(prefs.lang, "en", "another request starts afresh");
	prefs.lang = "ja";
	current = a;
	assert.equal(prefs.lang, "ar", "and leaves the first request's alone");
});

test("without a source there is one, as in the browser", () => {
	const state = learnerState(() => ({ n: 0 }));
	state.n++;
	state.n++;
	assert.equal(state.n, 2);
	assert.deepEqual({ ...state }, { n: 2 });
});
