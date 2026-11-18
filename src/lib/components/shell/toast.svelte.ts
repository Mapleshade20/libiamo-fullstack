import { untrack } from "svelte";

/* The one toast at the foot of the page (Toast.svelte): a new message replaces the one showing. Only the browser says
   anything here. */
export const toastState = $state<{ msg: string; n: number }>({ msg: "", n: 0 });
export function toast(msg: string) {
	toastState.msg = msg;
	// Not read as a dependency: an effect that toasts (a place's refusal) would otherwise run again on its own toast.
	toastState.n = untrack(() => toastState.n) + 1;
}
