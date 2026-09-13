import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import { t } from "$lib/i18n";
import ProfilePage from "$routes/(app)/profile/+page.svelte";

const data = {
	displayClock: { now: 1788480000000, timeZone: "UTC" },
	learnerDocumentLanguage: "fr",
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
	credentialConnected: true,
	loginMethodCount: 2,
	socialLoginMethods: [
		{ id: "google" as const, label: "Google" as const, configured: true, connected: true, connectedAt: "2026-03-14T09:00:00.000Z" },
		{ id: "github" as const, label: "GitHub" as const, configured: true, connected: false, connectedAt: null },
	],
	accountResult: null,
	accountFailure: null,
};

describe("Profile page", () => {
	it.each([true, false])("renders a concise password row and change form before hydration (connected: %s)", (credentialConnected) => {
		const { body } = render(ProfilePage, { props: { data: { ...data, credentialConnected }, form: null } });
		expect(body).toContain(t("fr", "profile.passwordMethod"));
		expect(body).toMatch(/<span[^>]*class="block truncate text-xs text-muted-foreground"[^>]*>alice@example.com<\/span>/);
		expect(body).not.toContain(`>${t("fr", "profile.connected")}</span>`);
		expect(body).toContain('action="?/changeEmail"');
		expect(body).toContain('<dialog aria-labelledby="email-dialog-title"');
		expect(body).not.toContain("<summary");
		expect(body).toMatch(/<input[^>]*name="newEmail"[^>]*required/);
	});

	it.each(["en", ""])("renders the native-language warning correctly before hydration (%s)", (nativeLanguage) => {
		const { body } = render(ProfilePage, { props: { data: { ...data, user: { ...data.user, nativeLanguage } }, form: null } });
		expect(body.includes(t("fr", "profile.feedbackMissingNative"))).toBe(!nativeLanguage);
	});

	it("renders saved provider and model values in SSR", () => {
		const { body } = render(ProfilePage, {
			props: { data: { ...data, apiBaseUrl: "https://api.deepseek.com", apiModel: "saved-model" }, form: null },
		});
		expect(body).toContain('value="saved-model"');
		expect(body).toMatch(/<option[^>]*value="https:\/\/api.deepseek.com"[^>]*selected/);
	});
	it("renders connected and available social login methods", () => {
		const { body } = render(ProfilePage, { props: { data, form: null } });

		expect(body).toContain('action="?/unlinkSocialAccount"');
		expect(body).toContain('action="?/linkSocialAccount"');
	});

	it("disables disconnecting the last login method", () => {
		const lastMethodData = {
			...data,
			credentialConnected: false,
			loginMethodCount: 1,
		};
		const { body } = render(ProfilePage, { props: { data: lastMethodData, form: null } });

		expect(body).toMatch(/action="\?\/unlinkSocialAccount"[\s\S]*?<button[^>]*disabled/);
	});

	// An account created through Google or GitHub has no credential row. Better Auth's
	// reset flow creates one, so this action is the only way such a user can add a
	// password — and losing the provider account is otherwise losing the account. It
	// posts rather than linking to the public form so the address comes from the
	// session: that form answers "sent" to any address, so a typo failed in silence.
	it("offers to mail a set-password link when the account has no password", () => {
		const { body } = render(ProfilePage, { props: { data: { ...data, credentialConnected: false }, form: null } });

		expect(body).toContain('action="?/sendPasswordSetup"');
	});

	it("does not offer to set a password when one already exists", () => {
		const { body } = render(ProfilePage, { props: { data, form: null } });

		expect(body).not.toContain('action="?/sendPasswordSetup"');
	});

	// Pressing again only mails a second link, so the button stands down once the
	// first one is out.
	it("names the address the set-password link went to and stops offering to resend", () => {
		const { body } = render(ProfilePage, {
			props: { data: { ...data, credentialConnected: false }, form: { passwordSetupSent: true } },
		});

		expect(body).toContain("alice@example.com");
		expect(body).not.toContain('action="?/sendPasswordSetup"');
	});

	it("reports a set-password link that could not be sent and keeps the retry", () => {
		const { body } = render(ProfilePage, {
			props: { data: { ...data, credentialConnected: false }, form: { passwordSetupSent: false } },
		});

		expect(body).toContain('action="?/sendPasswordSetup"');
	});

	it("dates each connected provider", () => {
		const { body } = render(ProfilePage, { props: { data, form: null } });
		const date = new Intl.DateTimeFormat("fr", { dateStyle: "medium", timeZone: "UTC" }).format(new Date("2026-03-14T09:00:00.000Z"));

		expect(body).toContain(t("fr", "profile.connectedSince").replace("{date}", date));
	});

	// The OAuth callback lands on `/profile?linked=<provider>`, and `use:enhance`
	// never clears it. Reading it after a form action reported back made every
	// later save announce a login-method change instead of its own result.
	it("stops replaying the OAuth landing notice once a form action reports back", () => {
		const landed = { ...data, accountResult: "connected" as const };

		const onLanding = render(ProfilePage, { props: { data: landed, form: null } });
		expect(onLanding.body).toContain(t("fr", "profile.methodConnectedTitle"));

		const afterSave = render(ProfilePage, { props: { data: landed, form: { success: true } } });
		expect(afterSave.body).not.toContain(t("fr", "profile.methodConnectedTitle"));
	});

	it("stops replaying a failed OAuth link once a form action reports back", () => {
		const landed = { ...data, accountFailure: "error" as const };

		const onLanding = render(ProfilePage, { props: { data: landed, form: null } });
		expect(onLanding.body).toContain(t("fr", "profile.methodErrorTitle"));

		const afterSave = render(ProfilePage, { props: { data: landed, form: { success: true } } });
		expect(afterSave.body).not.toContain(t("fr", "profile.methodErrorTitle"));
	});

	it("asks the user to sign in again when the session is too old to change login methods", () => {
		const { body } = render(ProfilePage, { props: { data, form: { accountResult: "stale-session" } } });

		expect(body).toContain(t("fr", "profile.methodStaleSessionTitle"));
	});

	it.each([
		["already-linked-elsewhere", "profile.methodAlreadyLinkedTitle"],
		["provider-email-unverified", "profile.methodUnverifiedTitle"],
		["cancelled", "profile.methodCancelledMessage"],
	] as const)("maps a %s refusal to its notice", (failure, key) => {
		const { body } = render(ProfilePage, { props: { data: { ...data, accountFailure: failure as never }, form: null } });

		expect(body).toContain(t("fr", key));
	});

	it("keeps the name form in a closed, labelled dialog instead of expanding the avatar row", () => {
		const { body } = render(ProfilePage, { props: { data, form: null } });
		const dialog = body.slice(body.indexOf("<dialog"), body.indexOf("</dialog>") + 9);
		expect(dialog).toContain('aria-labelledby="name-dialog-title"');
		expect(dialog.split(">")[0]).not.toMatch(/\sopen(?:\s|=|$)/);
		expect(dialog).toContain('name="name"');
		expect(dialog).toContain('maxlength="100"');
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

		expect(body.match(/name="levelSelfAssign"/g)).toHaveLength(3);
		expect(body).toContain('name="levelSelfAssign" value="3" checked');
		expect(body).toContain('action="?/updateProficiency"');
	});
});
