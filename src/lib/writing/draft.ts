/* What is being written in the home page's box stays on this device until it is sent, so a reload or a closed tab
   loses nothing. It is the one thing the browser keeps: nothing has been sent to the server yet. */
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
export const clearDraft = () => localStorage.removeItem(KEY);
