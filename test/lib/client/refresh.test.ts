import type { LoadEvent } from "@sveltejs/kit";
import { expect, it, vi } from "vitest";
import { opening, queuedRefresh, settled } from "#lib/client/refresh.ts";

vi.mock("$app/env", () => ({ browser: true }));
vi.mock("#lib/account/app.svelte.ts", () => ({ app: { lang: "en" } }));
vi.mock("#lib/components/tour/sandbox.svelte.ts", () => ({ sandboxed: () => false }));

it("never overlaps refreshes and coalesces a burst into one follow-up", async () => {
	let calls = 0;
	let finish = () => {};
	const refresh = queuedRefresh(async () => {
		calls++;
		if (calls === 1)
			await new Promise<void>((resolve) => {
				finish = resolve;
			});
	});
	const first = refresh();
	const rest = [refresh(), refresh(), refresh()];
	expect(calls).toBe(1);
	finish();
	await Promise.all([first, ...rest]);
	expect(calls).toBe(2);
});

/** A query as the load sees it: held or not, its answer arriving when `arrive` is called. */
function fakeQuery(ready: boolean) {
	let arrive = () => {};
	const answered = new Promise<void>((r) => {
		arrive = r;
	});
	return {
		ready,
		refresh: vi.fn(async () => {}),
		// biome-ignore lint/suspicious/noThenProperty: a remote query is awaited through its `then`, as this stand-in is.
		then: (ok: (v: unknown) => unknown) => answered.then(ok),
		arrive: () => arrive(),
	};
}
const at = (path: string) => ({ url: new URL(`http://app${path}`), parent: async () => ({}) }) as unknown as LoadEvent<Record<string, string>>;
const done = (p: Promise<unknown>) => Promise.race([p.then(() => true), new Promise((r) => setTimeout(() => r(false), 20))]);

it("waits for nothing while the first page hydrates on the server's answers", async () => {
	const missing = fakeQuery(false);
	expect(await opening(() => [missing])(at("/hydrating"))).toEqual({ opened: [] });
});

it("waits for what is not held, and hands what is held to be asked again once the page shows it", async () => {
	settled();
	const held = fakeQuery(true);
	const missing = fakeQuery(false);
	const load = opening(() => [held, missing, null])(at("/notebook"));
	expect(await done(load)).toBe(false);
	missing.arrive();
	expect((await load).opened).toEqual([held]);
	expect(held.refresh).not.toHaveBeenCalled();
	// Opened again at once (a hover passing again, a quick trip back): nothing to ask again.
	expect((await opening(() => [held])(at("/notebook"))).opened).toEqual([]);
});

it("asks again first for a page that must open on the latest, however recently it was asked", async () => {
	const deck = fakeQuery(true);
	for (let i = 0; i < 2; i++) expect((await opening(() => [deck], { fresh: true })(at("/review"))).opened).toEqual([]);
	expect(deck.refresh).toHaveBeenCalledTimes(2);
});
