import { needKey } from "#lib/llm/stops.ts";
import { refreshWriting } from "#lib/writing/writing.svelte.ts";
import type { Setup } from "./types";

/*
 * A revision starts as a piece: the page that sends a draft in (the composer, a scenario's after page, the translation
 * sheet) creates it and goes to /live/<piece>. The piece is the handoff; the setup is also kept here, in memory, so the
 * page just opened does not ask the server for what it was handed a moment ago (a reload asks: `resume`).
 */
let handed: { id: string; setup: Setup } | null = null;

export async function startPiece(setup: Setup): Promise<string> {
	needKey();
	const r = await fetch("/api/s", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(setup),
	});
	const v = await r.json().catch(() => ({}));
	if (!r.ok || typeof v.id !== "string") throw new Error(v.error || "startFailed");
	handed = { id: v.id, setup };
	// It is one of their pieces now, unfinished until its revision ends.
	refreshWriting();
	return v.id;
}

/** The setup handed to the piece's page, once. */
export function takeHanded(id: string): Setup | null {
	if (handed?.id !== id) return null;
	const { setup } = handed;
	handed = null;
	return setup;
}
