import { brokenstar } from "#lib/server/dev/fixtures/brokenstar.ts";
import { darktail } from "#lib/server/dev/fixtures/darktail.ts";
import { esCdmx } from "#lib/server/dev/fixtures/es-cdmx.ts";
import { esEmail } from "#lib/server/dev/fixtures/es-email.ts";
import { esNarcos } from "#lib/server/dev/fixtures/es-narcos.ts";
import { esReddit } from "#lib/server/dev/fixtures/es-reddit.ts";
import { imposter } from "#lib/server/dev/fixtures/imposter.ts";
import { redditReal } from "#lib/server/dev/fixtures/reddit-real.ts";
import { shadow } from "#lib/server/dev/fixtures/shadow.ts";
import { shadow2 } from "#lib/server/dev/fixtures/shadow2.ts";
import type { Fixture } from "./types.ts";

export const FIXTURES: Record<string, Fixture> = {
	darktail,
	"reddit-real": redditReal,
	imposter,
	shadow,
	shadow2,
	brokenstar,
	"es-email": esEmail,
	"es-reddit": esReddit,
	"es-narcos": esNarcos,
	"es-cdmx": esCdmx,
};
