import { describe, expect, it } from "vitest";
import { resolveLearnerDocumentLanguage, resolvePageDocumentLanguage } from "$lib/document-language";

describe("document language", () => {
	it("normalizes the learner language", () => {
		expect(resolveLearnerDocumentLanguage("es")).toBe("es");
		expect(resolveLearnerDocumentLanguage(undefined)).toBe("en");
		expect(resolveLearnerDocumentLanguage("invalid")).toBe("en");
	});

	it("keeps ordinary learner pages in the active language", () => {
		expect(resolvePageDocumentLanguage({ routeId: "/(app)/review", isErrorPage: false, learnerDocumentLanguage: "fr" })).toBe("fr");
	});

	it.each([
		{ routeId: "/welcome", isErrorPage: false },
		{ routeId: "/welcome/example", isErrorPage: false },
		{ routeId: null, isErrorPage: true },
		{ routeId: "/(app)/review", isErrorPage: true },
	])("uses English for public and error pages: $routeId", ({ routeId, isErrorPage }) => {
		expect(resolvePageDocumentLanguage({ routeId, isErrorPage, learnerDocumentLanguage: "ja" })).toBe("en");
	});

	it("does not mistake an action failure for an error page", () => {
		expect(resolvePageDocumentLanguage({ routeId: "/(app)/profile", isErrorPage: false, learnerDocumentLanguage: "es" })).toBe("es");
	});
});
