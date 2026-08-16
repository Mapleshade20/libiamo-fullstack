import { error } from "@sveltejs/kit";
import { LANGUAGE_CODES, type LanguageCode } from "$lib/constants";
import type { StudyQueueKind } from "$lib/review";
import { requireUser } from "$lib/server/auth/authz";
import { getDueNotes } from "$lib/server/review";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);

	const language = (event.url?.searchParams.get("language") ?? user.activeLanguage ?? "en") as LanguageCode;
	if (!(LANGUAGE_CODES as readonly string[]).includes(language)) {
		throw error(400, "Invalid language");
	}

	let cards: Array<{
		id: number;
		vocab: string;
		nativeDefinition: string;
		nativeText: string;
		targetText: string;
		queueKind: StudyQueueKind;
		due: string;
		previewIntervals: Record<string, string>;
	}> = [];

	try {
		cards = (await getDueNotes(user.id, language, 20)).map((item) => ({
			id: item.id,
			vocab: item.vocab,
			nativeDefinition: item.nativeDefinition,
			nativeText: item.nativeText,
			targetText: item.targetText,
			queueKind: item.queueKind,
			due: item.due,
			previewIntervals: item.previewIntervals,
		}));
	} catch (err) {
		console.error("Failed to load review data:", err);
	}

	return { cards, reviewLanguage: language };
};
