/* What is being written in the home page's box stays on this device until it is sent, so a reload or a closed tab
   loses nothing; the other unsent drafts are in lib/client/drafts.ts. Signing out empties both. */
const KEY = "homeDraft";
export function loadDraft<T extends object>(): Partial<T> {
	try {
		return JSON.parse(localStorage.getItem(KEY) ?? "{}");
	} catch {
		return {};
	}
}
export const keepDraft = (draft: object) => localStorage.setItem(KEY, JSON.stringify(draft));
/** The draft went in (a piece now): the box starts empty next time. */
export const clearDraft = () => {
	try {
		localStorage.removeItem(KEY);
	} catch {
		// Nothing kept.
	}
};
