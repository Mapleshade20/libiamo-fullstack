export type HintMode = "content" | "expression";

export type HintRequestToken = {
	id: number;
	mode: HintMode;
};

export function createHintRequestLifecycle() {
	let currentId = 0;
	let currentMode: HintMode | null = null;

	return {
		begin(mode: HintMode): HintRequestToken {
			currentMode = mode;
			return { id: ++currentId, mode };
		},
		isCurrent(token: HintRequestToken) {
			return token.id === currentId && token.mode === currentMode;
		},
		finish(token: HintRequestToken) {
			if (token.id !== currentId || token.mode !== currentMode) return;
			currentMode = null;
		},
		invalidate() {
			currentId++;
			currentMode = null;
		},
	};
}
