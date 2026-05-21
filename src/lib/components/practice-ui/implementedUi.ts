import type { UiVariant } from "$lib/constants";

export const IMPLEMENTED_PRACTICE_UIS = ["discord", "imessage", "apple_mail", "ao3", "reddit"] as const satisfies readonly UiVariant[];

export function isPracticeUiImplemented(ui: string | null | undefined): ui is UiVariant {
	return typeof ui === "string" && (IMPLEMENTED_PRACTICE_UIS as readonly string[]).includes(ui);
}
