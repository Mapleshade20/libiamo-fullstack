import { describe, expect, it, vi } from "vitest";
import { createQuestHallPreparationResource } from "$lib/client/quest-hall/preparation-resource";

function response(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("Quest Hall preparation resource", () => {
	it("publishes loading and ready states with an edition-scoped request", async () => {
		const preparation = { kind: "quest", key: "daily-2", data: { task: { id: 2 }, nativeLanguage: "fr" } } as any;
		const fetcher = vi.fn().mockResolvedValue(response({ preparation }));
		const states: unknown[] = [];
		const resource = createQuestHallPreparationResource({
			endpoint: "/api/quest-hall/preparation",
			fetcher,
			onchange: (state) => states.push(state),
		});

		await resource.load("daily-2", "2026-09-04");

		expect(fetcher).toHaveBeenCalledWith(
			"/api/quest-hall/preparation?task=daily-2&edition=2026-09-04",
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
		expect(states).toEqual([
			{ status: "loading", key: "daily-2", preparation: null, error: null },
			{ status: "ready", key: "daily-2", preparation, error: null },
		]);
	});

	it("ignores an obsolete response after a newer selection", async () => {
		let resolveFirst!: (value: Response) => void;
		const first = new Promise<Response>((resolve) => {
			resolveFirst = resolve;
		});
		const secondPreparation = { kind: "quest", key: "daily-2", data: { task: { id: 2 }, nativeLanguage: null } } as any;
		const fetcher = vi
			.fn()
			.mockReturnValueOnce(first)
			.mockResolvedValueOnce(response({ preparation: secondPreparation }));
		const states: any[] = [];
		const resource = createQuestHallPreparationResource({ endpoint: "/preparation", fetcher, onchange: (state) => states.push(state) });

		const firstLoad = resource.load("daily-1", "2026-09-04");
		await resource.load("daily-2", "2026-09-04");
		resolveFirst(response({ preparation: { ...secondPreparation, key: "daily-1" } }));
		await firstLoad;

		expect(states.at(-1)).toMatchObject({ status: "ready", key: "daily-2" });
		expect(states.filter((state) => state.status === "ready")).toHaveLength(1);
	});

	it("exposes request failures and can reset the selected resource", async () => {
		const states: any[] = [];
		const resource = createQuestHallPreparationResource({
			endpoint: "/preparation",
			fetcher: vi.fn().mockResolvedValue(response({ error: "Not found" }, 404)),
			onchange: (state) => states.push(state),
		});

		await resource.load("translation-3", "2026-09-04");
		resource.cancel(true);

		expect(states.at(-2)).toEqual({ status: "error", key: "translation-3", preparation: null, error: "Not found" });
		expect(states.at(-1)).toEqual({ status: "idle", key: null, preparation: null, error: null });
	});

	it("can retry the same selected item after a failure", async () => {
		const preparation = { kind: "translation", key: "translation-3", data: { template: { id: 3 } } } as any;
		const states: any[] = [];
		const resource = createQuestHallPreparationResource({
			endpoint: "/preparation",
			fetcher: vi
				.fn()
				.mockResolvedValueOnce(response({ error: "Unavailable" }, 503))
				.mockResolvedValueOnce(response({ preparation })),
			onchange: (state) => states.push(state),
		});

		await resource.load("translation-3", "2026-09-04");
		await resource.load("translation-3", "2026-09-04");

		expect(states.map((state) => state.status)).toEqual(["loading", "error", "loading", "ready"]);
	});

	it("requests a Hall refresh when the selected edition has expired", async () => {
		const onEditionExpired = vi.fn();
		const resource = createQuestHallPreparationResource({
			endpoint: "/preparation",
			fetcher: vi.fn().mockResolvedValue(response({ error: "This Quest Hall edition is no longer current" }, 409)),
			onchange: vi.fn(),
			onEditionExpired,
		});

		await resource.load("daily-2", "2026-09-04");

		expect(onEditionExpired).toHaveBeenCalledOnce();
	});
});
