import { beforeEach, expect, it, vi } from "vitest";

const remote = vi.hoisted(() => ({ savePrefs: vi.fn(), saveLook: vi.fn() }));
const told = vi.hoisted(() => ({ toast: vi.fn(), hydrate: vi.fn(async () => {}) }));
vi.mock("#lib/account/account.remote.ts", () => remote);
vi.mock("#lib/components/shell/toast.svelte.ts", () => ({ toast: told.toast }));
vi.mock("#lib/i18n/tx.ts", () => ({ tx: (k: string) => k }));
vi.mock("#lib/account/account.svelte.ts", () => ({ hydrate: told.hydrate }));

const { app } = await import("#lib/account/app.svelte.ts");

beforeEach(() => {
	vi.clearAllMocks();
	app.onboarded = true;
});

it("sends changes one after another, each with the settings as they are when its turn comes", async () => {
	const sent: number[] = [];
	let release = () => {};
	remote.savePrefs.mockImplementationOnce(
		(p: { weeklyGoal: number }) =>
			new Promise<void>((resolve) => {
				sent.push(p.weeklyGoal);
				release = resolve;
			}),
	);
	remote.savePrefs.mockImplementation(async (p: { weeklyGoal: number }) => {
		sent.push(p.weeklyGoal);
	});
	const settle = () => new Promise((r) => setTimeout(r));
	app.prefs.weeklyGoal = 2;
	const first = app.save();
	await settle();
	app.prefs.weeklyGoal = 5;
	const second = app.save();
	await settle();
	// The second waits for the first to be answered.
	expect(sent).toEqual([2]);
	release();
	expect(await first).toBe(true);
	expect(await second).toBe(true);
	expect(sent).toEqual([2, 5]);
	expect(told.toast).not.toHaveBeenCalled();
});

it("says when a change was not kept, and shows the server's settings again", async () => {
	remote.savePrefs.mockRejectedValueOnce(new Error("offline"));
	remote.saveLook.mockResolvedValue(undefined);
	vi.spyOn(console, "error").mockImplementation(() => {});
	expect(await app.save()).toBe(false);
	expect(told.toast).toHaveBeenCalledWith("setNotSaved");
	expect(told.hydrate).toHaveBeenCalledOnce();
	// The queue goes on after a failure.
	expect(await app.saveLook({ theme: "dark" })).toBe(true);
});

it("keeps the welcome's settings on the page until the account is set up", async () => {
	app.onboarded = false;
	expect(await app.save()).toBe(true);
	expect(remote.savePrefs).not.toHaveBeenCalled();
});
