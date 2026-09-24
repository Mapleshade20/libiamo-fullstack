import { getContext, setContext } from "svelte";
import type { CelebrationKind } from "$lib/streak/presentation";
export class StreakPresentation {
	ready = $state(false);
	show = $state<{ kind: CelebrationKind; token: number } | null>(null);
	private sequence = 0;
	play(kind: CelebrationKind) {
		this.show = { kind, token: ++this.sequence };
	}
}
const key = Symbol("streak-presentation");
export function provideStreakPresentation() {
	return setContext(key, new StreakPresentation());
}
export function getStreakPresentation() {
	return getContext<StreakPresentation>(key);
}
