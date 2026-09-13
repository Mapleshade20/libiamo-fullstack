import { describe, expect, it } from "vitest";
import { renderErrorTemplate } from "../../scripts/error-template.mjs";

const source = '<a href="%libiamo.base%/">Return to Libiamo</a>';

describe("fatal error template", () => {
	it.each([
		["", '<a href="/">'],
		["/review-base", '<a href="/review-base/">'],
		["/se-projects/libiamo", '<a href="/se-projects/libiamo/">'],
	])("renders base %j", (base, expected) => {
		const rendered = renderErrorTemplate(source, base);
		expect(rendered).toContain(expected);
		expect(rendered).not.toContain("%libiamo.base%");
	});

	it("escapes the base before inserting it into an attribute", () => {
		expect(renderErrorTemplate(source, '/review&"<>')).toContain('href="/review&amp;&quot;&lt;&gt;/"');
	});

	it.each(["<p>No placeholder</p>", `${source}${source}`])("rejects a missing or repeated placeholder", (template) => {
		expect(() => renderErrorTemplate(template, "/review-base")).toThrow(/exactly once/);
	});
});
