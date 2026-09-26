import { base } from "$app/paths";
import { threadText } from "$lib/practice/comment-thread";

export type Ao3OpeningState = {
	workTitle?: string;
	authorName?: string;
	chapterTitle?: string;
	summary?: string;
	bodyExcerpt?: string;
	rating?: string;
	archiveWarning?: string;
	categories?: string[];
	fandoms?: string[];
	relationships?: string[];
	characters?: string[];
	additionalTags?: string[];
	tags?: string[];
};

export const DEFAULT_AO3_ICON = `${base}/ao3/icon_user.png`;

/** The work as AO3 shows it above the comments, with the site's defaults for missing fields. */
export function describeWork(opening: Ao3OpeningState) {
	const list = (values: string[] | undefined) => (values ?? []).filter(Boolean);
	return {
		title: threadText(opening.workTitle, "Untitled Work"),
		author: threadText(opening.authorName, "FicAuthor"),
		chapterTitle: threadText(opening.chapterTitle, "Chapter 1"),
		summary: threadText(opening.summary),
		excerpt: threadText(opening.bodyExcerpt, "(Chapter text continues here...)"),
		tags: [
			["Rating", [threadText(opening.rating, "Teen And Up Audiences")]],
			["Archive Warning", [threadText(opening.archiveWarning, "No Archive Warnings Apply")]],
			["Category", list(opening.categories)],
			["Fandoms", opening.fandoms?.length ? list(opening.fandoms) : ["Original Work"]],
			["Relationships", list(opening.relationships)],
			["Characters", list(opening.characters)],
			["Additional Tags", [...new Set([...list(opening.additionalTags), ...list(opening.tags)])]],
		].filter(([, values]) => values.length > 0) as Array<[string, string[]]>,
	};
}
