import { requireAdmin } from "$lib/server/auth/authz";
import type { PageServerLoad } from "./$types";
import type { GuideLanguage } from "./guide-content";

export const load: PageServerLoad = async (event) => {
	const viewer = requireAdmin(event);
	const requested = event.url.searchParams.get("lang");
	const language: GuideLanguage = requested === "zh" || requested === "en" ? requested : viewer.nativeLanguage === "zh" ? "zh" : "en";
	return { language };
};
