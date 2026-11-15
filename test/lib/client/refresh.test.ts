import { expect, it } from "vitest";
import { queuedRefresh } from "#lib/client/refresh.ts";

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
