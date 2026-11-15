import { keepCookie } from "#lib/client/cookie.ts";
import { learnerState } from "#lib/scope.ts";

/* The shell's own state: whether the bar is folded to its stickers (this device's, in a cookie the server reads),
   whether the phone's drawer is open, and what the current page asks of the top bar. */
class Shell {
	folded = $state(false);
	drawer = $state(false);
	/** The home page shows a button to see its backdrop whole. */
	viewable = $state(false);
	viewing = $state(false);
	setFolded(on: boolean) {
		this.folded = on;
		document.documentElement.classList.toggle("side-folded", on);
		keepCookie("side", on ? "folded" : "open");
	}
	setDrawer(on: boolean) {
		this.drawer = on;
		document.documentElement.classList.toggle("drawer", on);
	}
}
export const shell = learnerState(() => new Shell());
