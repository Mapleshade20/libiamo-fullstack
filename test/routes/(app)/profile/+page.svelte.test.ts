import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import ProfilePage from "$routes/(app)/profile/+page.svelte";

const data = {
	user: {
		name: "Alice",
		email: "alice@example.com",
		role: "user",
		activeLanguage: "fr",
		timezone: "Europe/Paris",
		nativeLanguage: "en",
		feedbackLanguagePreference: "native",
	},
	avatarUrl: "https://example.com/avatar.png",
	serverTimezones: [{ value: "Europe/Paris", label: "Europe/Paris" }],
	serverNativeLanguages: [{ value: "en" as const, label: "English" }],
	hasApiKey: false,
	trialQuota: null,
	apiBaseUrl: "",
	apiModel: "",
};

describe("Profile page", () => {
	it("keeps name editing in the avatar card and omits the duplicate language switcher", () => {
		const { body } = render(ProfilePage, { props: { data, form: null } });

		expect(body).toContain("Alice");
		expect(body).toContain('aria-label="Modifier le nom"');
		expect(body).toContain("Votre avatar est associé à votre adresse e-mail via");
		expect(body).not.toContain('action="?/switchLanguage"');
	});

	it("localizes profile fields and controls using the active language", () => {
		const { body } = render(ProfilePage, { props: { data, form: null } });

		expect(body).toContain("Profil");
		expect(body).toContain("Paramètres");
		expect(body).toContain("Fuseau Horaire");
		expect(body).toContain("Sélectionnez votre langue maternelle");
		expect(body).toContain("Clé API du LLM");
		expect(body).toContain("Saisissez votre clé API");
		expect(body).toContain("Enregistrer la clé API");
		expect(body).toContain("Déconnexion");
	});

	it.each(["feedbackLanguagePreference", "timezone", "nativeLanguage"])("renders %s without a Save button", (field) => {
		const { body } = render(ProfilePage, { props: { data, form: null } });
		const fieldPosition = body.indexOf(`name="${field}"`);
		const formStart = body.lastIndexOf("<form", fieldPosition);
		const formEnd = body.indexOf("</form>", fieldPosition);
		const fieldForm = body.slice(formStart, formEnd);

		expect(fieldPosition).toBeGreaterThan(-1);
		expect(fieldForm).toContain('action="?/updateProfile"');
		expect(fieldForm).not.toContain("<button");
	});
});
