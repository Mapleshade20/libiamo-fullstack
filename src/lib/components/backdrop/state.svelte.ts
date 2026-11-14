/** Bumped when the learner changes the backdrop (it is kept in localStorage, which nothing observes). */
export const backdropState = $state({ version: 0 });
export function setBackdrop(key: "backdrop" | "pattern", value: string) {
	localStorage.setItem(key, value);
	backdropState.version++;
}
