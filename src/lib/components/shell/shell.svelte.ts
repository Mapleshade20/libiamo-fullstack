/* The shell's own state: whether the bar is folded to its stickers (a desktop preference), whether the phone's drawer
   is open, and what the current page asks of the top bar. */
class Shell {
	folded = $state(document.documentElement.classList.contains("side-folded"));
	drawer = $state(false);
	/** The home page shows a button to see its backdrop whole. */
	viewable = $state(false);
	viewing = $state(false);
	setFolded(on: boolean) {
		this.folded = on;
		document.documentElement.classList.toggle("side-folded", on);
		localStorage.setItem("sideFolded", on ? "1" : "0");
	}
	setDrawer(on: boolean) {
		this.drawer = on;
		document.documentElement.classList.toggle("drawer", on);
	}
}
export const shell = new Shell();
