import { opening } from "#lib/client/refresh.ts";
import { pieceById } from "#lib/writing/writing.remote.ts";

export const load = opening(({ params }) => [pieceById(params.id)]);
