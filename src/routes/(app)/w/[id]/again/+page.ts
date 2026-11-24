import { opening } from "#lib/client/refresh.ts";
import { scenarioView } from "#lib/scenario/scenario.remote.ts";
import { pieceById } from "#lib/writing/writing.remote.ts";

// The scenario is the piece's: asked for once the piece is there.
export const load = opening(async ({ params }) => {
	const piece = pieceById(params.id);
	const w = await Promise.resolve(piece).catch(() => null);
	return [piece, w?.scenarioId ? scenarioView({ id: w.scenarioId, lang: w.lang }) : null];
});
