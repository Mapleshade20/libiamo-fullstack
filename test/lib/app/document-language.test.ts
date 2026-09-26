import { describe, expect, it } from "vitest";
import { applyDocumentLanguageToHtml, resolveLearnerDocumentLanguage, resolvePageDocumentLanguage } from "$lib/app/document-language";

describe("document language", () => {
	it("normalizes the learner language", () => {
		expect(resolveLearnerDocumentLanguage("es")).toBe("es");
		expect(resolveLearnerDocumentLanguage(undefined)).toBe("en");
		expect(resolveLearnerDocumentLanguage("invalid")).toBe("en");
	});

	it("keeps ordinary learner pages in the active language", () => {
		expect(resolvePageDocumentLanguage({ routeId: "/(app)/review", learnerDocumentLanguage: "fr" })).toBe("fr");
	});

	it.each(["/welcome", "/welcome/example", null])("uses English for public and unmatched pages: %s", (routeId) => {
		expect(resolvePageDocumentLanguage({ routeId, learnerDocumentLanguage: "ja" })).toBe("en");
	});

	it("uses the routed error marker when transforming SSR HTML", () => {
		const html = '<html lang="en"><head><meta name="libiamo-document-language" content="en"></head></html>';

		expect(applyDocumentLanguageToHtml(html, "ja")).toContain('<html lang="en">');
	});

	it("applies the learner language to ordinary SSR HTML", () => {
		expect(applyDocumentLanguageToHtml('<html lang="en"><head></head></html>', "es")).toContain('<html lang="es">');
	});
});
