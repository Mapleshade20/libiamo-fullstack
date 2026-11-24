import { opening } from "#lib/client/refresh.ts";
import { mySuggestions } from "#lib/scenario/suggestion.remote.ts";

export const load = opening(() => [mySuggestions()], { fresh: true });
