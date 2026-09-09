import type { QuestMenuItemKey } from "$lib/quest-hall/menu";
import type { QuestHallPreparation } from "$lib/server/quest-hall-preparation";

export type QuestHallPreparationResourceState =
	| { status: "idle"; key: null; preparation: null; error: null }
	| { status: "loading"; key: QuestMenuItemKey; preparation: null; error: null }
	| { status: "ready"; key: QuestMenuItemKey; preparation: QuestHallPreparation; error: null }
	| { status: "error"; key: QuestMenuItemKey; preparation: null; error: string };

interface CreateQuestHallPreparationResourceOptions {
	endpoint: string;
	fetcher?: typeof fetch;
	onchange: (state: QuestHallPreparationResourceState) => void;
	onEditionExpired?: () => void;
}

function isAbortError(cause: unknown): boolean {
	return cause instanceof DOMException && cause.name === "AbortError";
}

export function createQuestHallPreparationResource({
	endpoint,
	fetcher = fetch,
	onchange,
	onEditionExpired,
}: CreateQuestHallPreparationResourceOptions) {
	let requestSequence = 0;
	let controller: AbortController | null = null;

	async function load(key: QuestMenuItemKey, editionDate: string): Promise<void> {
		controller?.abort();
		controller = new AbortController();
		const sequence = ++requestSequence;
		onchange({ status: "loading", key, preparation: null, error: null });

		const params = new URLSearchParams({ task: key, edition: editionDate });
		try {
			const response = await fetcher(`${endpoint}?${params}`, {
				headers: { accept: "application/json" },
				signal: controller.signal,
			});
			const body = (await response.json()) as { preparation?: QuestHallPreparation; error?: string };
			if (sequence !== requestSequence) return;
			if (!response.ok || !body.preparation || body.preparation.key !== key) {
				onchange({ status: "error", key, preparation: null, error: body.error ?? "Failed to load preparation" });
				if (response.status === 409) onEditionExpired?.();
				return;
			}
			onchange({ status: "ready", key, preparation: body.preparation, error: null });
		} catch (cause) {
			if (sequence !== requestSequence || isAbortError(cause)) return;
			onchange({ status: "error", key, preparation: null, error: "Failed to load preparation" });
		}
	}

	function cancel(reset = false): void {
		requestSequence += 1;
		controller?.abort();
		controller = null;
		if (reset) onchange({ status: "idle", key: null, preparation: null, error: null });
	}

	return { load, cancel };
}
