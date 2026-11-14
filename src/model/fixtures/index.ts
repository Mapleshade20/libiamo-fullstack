import { brokenstar } from "./brokenstar.ts";
import { darktail } from "./darktail.ts";
import { esCdmx } from "./es-cdmx.ts";
import { esEmail } from "./es-email.ts";
import { esNarcos } from "./es-narcos.ts";
import { esReddit } from "./es-reddit.ts";
import { imposter } from "./imposter.ts";
import { redditReal } from "./reddit-real.ts";
import { shadow } from "./shadow.ts";
import { shadow2 } from "./shadow2.ts";
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
