import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import SignUpPage from "$routes/(auth)/sign-up/+page.svelte";

const data = {
	displayClock: { now: 1788480000000, timeZone: "UTC" },
	socialProviders: ["google" as const, "github" as const],
	socialAuthError: null,
};

const renderPage = (form: { values?: Record<string, string> } | null = null) => render(SignUpPage, { props: { data, form: form as never } }).body;

/**
 * The markup inside the collapsible region only. Slicing to `</form>` instead
 * would keep anything hoisted out of the region but left in the form, which is
 * exactly the regression these assertions exist to catch.
 */
function collapsibleRegion(body: string) {
	const start = body.indexOf('<div class="reveal ');
	expect(start).toBeGreaterThan(-1);

	let depth = 0;
	for (const match of body.slice(start).matchAll(/<div\b|<\/div>/g)) {
		depth += match[0] === "</div>" ? -1 : 1;
		if (depth === 0) return body.slice(start, start + match.index + "</div>".length);
	}
	throw new Error("The reveal wrapper is never closed");
}

/**
 * The reveal is driven entirely by CSS — `form:has(#activeLanguage
 * option[value=""]:checked)` — so that it survives with scripting off and so a
 * server render that echoes a language back is already expanded on the first
 * paint. Nothing here can exercise the stylesheet, but every assumption that
 * selector rests on lives in this markup, and each one fails silently: the
 * section would be stuck open, stuck shut, or flash on load.
 */
describe("Sign-up progressive reveal", () => {
	it("leaves the placeholder option selected until a language is chosen", () => {
		expect(renderPage()).toMatch(/<option value="" disabled=""[^>]*selected/);
	});

	it("deselects the placeholder once the server echoes a language back", () => {
		const body = renderPage({ values: { activeLanguage: "fr" } });

		const placeholder = body.slice(body.indexOf('<option value=""'), body.indexOf("</option>"));
		expect(placeholder).not.toContain("selected");
		expect(body).toMatch(/<option value="fr"[^>]*selected/);
	});

	it("keeps every credential field and social button inside the collapsible region", () => {
		const revealed = collapsibleRegion(renderPage());

		for (const field of ['name="name"', 'name="email"', 'name="password"']) {
			expect(revealed).toContain(field);
		}
		// Social sign-up carries the chosen language in the OAuth state, so it must not
		// be reachable before one is picked either.
		expect(revealed).toContain('data-social-provider="google"');
		expect(revealed).toContain('data-social-provider="github"');
	});

	// The collapsed fields keep their `required` attributes, which is only safe
	// because the select is required too and the browser reports on the first
	// invalid control in tree order — a visible one.
	it("puts the language select ahead of the fields it reveals", () => {
		const body = renderPage();

		expect(body.indexOf('id="activeLanguage"')).toBeLessThan(body.indexOf('<div class="reveal '));
		expect(body).toMatch(/<select id="activeLanguage"[^>]*required/);
		expect(collapsibleRegion(body)).not.toContain('id="activeLanguage"');
	});
});
