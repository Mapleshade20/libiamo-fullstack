import { captureTourState } from "#lib/components/tour/lifetime.ts";
import { needKey } from "#lib/llm/stops.ts";
import { refreshWriting } from "#lib/writing/writing.svelte.ts";
import type { Setup, Start } from "./types";

/*
 * A revision starts as a piece: the page that sends a draft in (the composer, a scenario's after page, the translation
 * sheet) creates it and goes to /live/<piece>. The piece is the handoff; the setup the server answers with (the same a
 * reload gets from `resume`) is kept here, in memory, so the page just opened does not ask for it again.
 */
let handed: { id: string; setup: Setup } | null = null;

export async function startPiece(start: Start): Promise<string> {
	const active = captureTourState();
	needKey();
	const r = await fetch("/api/s", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(start),
	});
	const v = await r.json().catch(() => ({}));
	if (!active()) throw new DOMException("Tour chapter changed", "AbortError");
	if (!r.ok || typeof v.id !== "string" || !v.setup) throw new Error(v.error || "startFailed");
	handed = { id: v.id, setup: v.setup };
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
