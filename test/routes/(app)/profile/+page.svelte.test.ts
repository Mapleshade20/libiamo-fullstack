import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import ProfilePage from "$routes/(app)/profile/+page.svelte";

const data = {
	accountScope: "account-a",
	questHallEdition: "2026-09-04",
	user: {
		name: "Alice",
		email: "alice@example.com",
		role: "user",
		activeLanguage: "fr",
		nativeLanguage: "en",
		feedbackLanguagePreference: "native",
	},
	avatarUrl: "https://example.com/avatar.png",
	serverNativeLanguages: [{ value: "en" as const, label: "English" }],
	hasApiKey: false,
	trialQuota: null,
	apiBaseUrl: "",
	apiModel: "",
	levelSelfAssign: 2 as const,
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
		expect(body).toContain("Sélectionnez votre langue maternelle");
		expect(body).toContain("Clé API du LLM");
		expect(body).toContain("Saisissez votre clé API");
		expect(body).toContain("Enregistrer la clé API");
		expect(body).toContain("Déconnexion");
	});

	it("keeps the name form in a closed, labelled dialog instead of expanding the avatar row", () => {
		const { body } = render(ProfilePage, { props: { data, form: null } });
		const dialog = body.slice(body.indexOf("<dialog"), body.indexOf("</dialog>") + 9);
		expect(dialog).toContain('aria-labelledby="name-dialog-title"');
		expect(dialog.split(">")[0]).not.toMatch(/\sopen(?:\s|=|$)/);
		expect(dialog).toContain('name="name"');
		expect(dialog).toContain('maxlength="100"');
		expect(dialog).toContain("Enregistrer le nom");
		expect(dialog).toContain('id="name-dialog-error"');
		expect(body).toContain('aria-haspopup="dialog"');
	});

	it.each(["feedbackLanguagePreference", "nativeLanguage"])("renders %s without a Save button", (field) => {
		const { body } = render(ProfilePage, { props: { data, form: null } });
		const fieldPosition = body.indexOf(`name="${field}"`);
		const formStart = body.lastIndexOf("<form", fieldPosition);
		const formEnd = body.indexOf("</form>", fieldPosition);
		const fieldForm = body.slice(formStart, formEnd);

		expect(fieldPosition).toBeGreaterThan(-1);
		expect(fieldForm).toContain('action="?/updateProfile"');
		expect(fieldForm).not.toContain("<button");
	});

	it("shows the three self-assignment ranges and selects the saved active-language level", () => {
		const { body } = render(ProfilePage, { props: { data: { ...data, levelSelfAssign: 3 }, form: null } });

		expect(body).toContain("Niveau de tâches recommandé");
		expect(body).toContain("A2–B1");
		expect(body).toContain("B2–C1");
		expect(body).toContain("C2+");
		expect(body).toContain('name="levelSelfAssign" value="3" checked');
		expect(body).toContain('action="?/updateProficiency"');
	});
});
