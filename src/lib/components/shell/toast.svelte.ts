/* The one toast at the foot of the page (Toast.svelte): a new message replaces the one showing. Only the browser says
   anything here. */
export const toastState = $state<{ msg: string; n: number }>({ msg: "", n: 0 });
export function toast(msg: string) {
	toastState.msg = msg;
	toastState.n++;
}
