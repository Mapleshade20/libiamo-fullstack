import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { t } from "$lib/i18n";
import ProfilePage from "$routes/(app)/profile/+page.svelte";

type EnhanceResult = { result: { type: string }; update: (options?: { reset?: boolean }) => Promise<void> };
type SubmitCallback = (options: EnhanceResult) => Promise<void>;

const captured = vi.hoisted(() => ({ enhances: [] as Array<{ node: Element; submit: () => SubmitCallback }> }));

vi.mock("$app/forms", () => ({
	enhance: (node: Element, submit: () => SubmitCallback) => {
		captured.enhances.push({ node, submit });
		return {};
	},
}));
vi.mock("$app/navigation", () => ({ afterNavigate: vi.fn(), replaceState: vi.fn() }));
vi.mock("$app/paths", () => ({ base: "" }));

beforeAll(() => {
	window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as never;
	Element.prototype.animate = (() => ({ finished: Promise.resolve(), cancel() {} })) as never;
});

const data = {
	displayClock: { now: 1788480000000, timeZone: "UTC" },
	learnerDocumentLanguage: "fr",
	accountScope: "account-a",
	questHallEdition: "2026-09-04",
	user: {
		id: "user_1",
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
	llmTraceSetting: null as { enabled: boolean } | null,
	credentialConnected: true,
	loginMethodCount: 2,
	socialLoginMethods: [{ id: "google" as const, label: "Google" as const, configured: true, connected: true, connectedAt: null }],
	accountResult: null,
	accountFailure: null,
	streak: null,
	streakQueueEmpty: true,
	streakDayOffset: 0,
};

const succeeded: EnhanceResult = { result: { type: "success" }, update: async () => {} };

let component: ReturnType<typeof mount> | undefined;
afterEach(() => {
	if (component) unmount(component);
	component = undefined;
	captured.enhances.length = 0;
	document.body.innerHTML = "";
	vi.useRealTimers();
});

function render() {
	const target = document.createElement("div");
	document.body.append(target);
	component = mount(ProfilePage, { target, props: { data, form: null } as never });
	flushSync();
	return target;
}

/** Handles one submit of whichever form lives in the Settings card, the way SvelteKit would. */
function startSave(root: HTMLElement) {
	const form = [...root.querySelectorAll("form")].find((candidate) =>
		candidate.closest('[data-slot="card"]')?.textContent?.includes(t("fr", "profile.settings")),
	);
	const enhance = captured.enhances.find((entry) => entry.node === form);
	if (!enhance) throw new Error("the Settings form is not enhanced");
	const finish = enhance.submit();
	const pending = finish(succeeded);
	flushSync();
	return { finish, pending };
}

function statusText(root: HTMLElement) {
	return root.querySelector('p[aria-live="polite"]')?.textContent ?? "";
}

describe("Profile autosave status", () => {
	it("holds the saving status for a beat, so an instant save reads as a state rather than a flicker", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
		const root = render();

		const { pending } = startSave(root);
		expect(statusText(root)).toBe(t("fr", "profile.saving"));

		await pending;
		await vi.advanceTimersByTimeAsync(300);
		expect(statusText(root)).toBe(t("fr", "profile.saving"));

		await vi.advanceTimersByTimeAsync(200);
		expect(statusText(root)).toBe(t("fr", "profile.saved"));

		await vi.advanceTimersByTimeAsync(2600);
		expect(statusText(root)).toBe("");
	});

	it("lets a new save supersede the status the previous one was about to show", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
		const root = render();

		await startSave(root).pending;
		await vi.advanceTimersByTimeAsync(200);
		await startSave(root).pending;
		// The first save's beat elapses here, and may not end the second save's status.
		await vi.advanceTimersByTimeAsync(300);
		expect(statusText(root)).toBe(t("fr", "profile.saving"));

		await vi.advanceTimersByTimeAsync(200);
		expect(statusText(root)).toBe(t("fr", "profile.saved"));
	});

	it("drops the status immediately when the save is refused", async () => {
		const root = render();
		const { finish, pending } = startSave(root);

		await finish({ result: { type: "failure" }, update: async () => {} });
		await pending;
		flushSync();
		expect(statusText(root)).toBe("");
	});
});
