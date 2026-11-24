import type { ExchangePlace, ScenarioKind } from "#lib/constants.ts";
import type { Opening } from "#lib/exchange/opening.ts";
import type { ExchangeVersion, TranslationVersion } from "./versions.ts";

/*
 * A new version, valid as it stands so a draft can be saved at once: one person, the place's opening with that person
 * writing in it, placeholders the admin writes over.
 */
const SOMEONE: Record<ExchangePlace, string> = { ao3: "author", reddit: "u/someone", email: "Someone", discord: "someone", imessage: "Someone" };

export function blankOpening(place: ExchangePlace, who = SOMEONE[place]): Opening {
	switch (place) {
		case "ao3":
			return { workTitle: "Untitled work", authorName: who, chapterTitle: "Chapter 1", bodyExcerpt: "", endNote: "" };
		case "reddit":
			return { post: { title: "Title", body: "", subreddit: "subreddit", author: who }, previousComments: [] };
		case "email":
			return { emails: [{ from: who, to: "", subject: "Subject", body: "" }] };
		case "discord":
			return { serverName: "Server", channelName: "general", previousMessages: [{ sender: who, text: "…" }] };
		case "imessage":
			return { previousMessages: [{ sender: who, text: "…" }] };
	}
}

export function blankVersion(kind: "exchange", place: ExchangePlace, title?: string): ExchangeVersion;
export function blankVersion(kind: "translation", place: "translation", title?: string): TranslationVersion;
export function blankVersion(kind: ScenarioKind, place: string, title?: string): ExchangeVersion | TranslationVersion;
export function blankVersion(kind: ScenarioKind, place: string, title = "Untitled"): ExchangeVersion | TranslationVersion {
	if (kind === "translation")
		return { draft: true, title, line: "", introduction: "", original: "…", where: "", readers: "", terms: [], leaveOut: [] };
	const p = place as ExchangePlace;
	return {
		draft: true,
		title,
		line: "",
		you: "",
		people: [{ name: SOMEONE[p], who: "", notes: "" }],
		goals: [],
		others: "",
		opening: blankOpening(p),
		followed: [],
	};
}
