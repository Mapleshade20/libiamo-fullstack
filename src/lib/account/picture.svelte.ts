/*
 * The account's picture, as the browser finds it: the server names Gravatar's address and nothing more, so a page
 * never waits for Gravatar (often slow or unreachable from mainland China). The initial shows from the first paint;
 * the picture takes its place once it has loaded, if that happens within a few seconds. An address without a picture
 * (Gravatar answers 404), one that fails, or one that takes longer keeps the initial for as long as the page is open.
 */

/** How long a picture may take to arrive before the initial stays. */
export const PICTURE_WAIT_MS = 4000;

// Only ever filled in the browser (the probes run in effects), so one map for the page is safe.
const settled = new Map<string, boolean>();
const asked = new Map<string, Promise<boolean>>();

/** Whether the picture at `url` loads within `wait` milliseconds; asked once per address while the page is open. */
export function probePicture(url: string, wait = PICTURE_WAIT_MS): Promise<boolean> {
	let p = asked.get(url);
	if (!p) {
		p = new Promise<boolean>((resolve) => {
			const img = new Image();
			const end = (ok: boolean) => {
				clearTimeout(timer);
				img.onload = img.onerror = null;
				// A picture that arrives after the wait would only make the face jump: it is dropped.
				if (!ok) img.src = "";
				settled.set(url, ok);
				resolve(ok);
			};
			const timer = setTimeout(() => end(false), wait);
			img.onload = () => end(img.naturalWidth > 0);
			img.onerror = () => end(false);
			img.referrerPolicy = "no-referrer";
			img.src = url;
		});
		asked.set(url, p);
	}
	return p;
}

/**
 * The picture to show for `url`, or undefined while it is loading or when it did not come. Call it while a component is
 * being set up. A picture the page already has shows at once on later pages; the first paint after the server's always
 * has the initial, as the server's page did.
 */
export function loadedPicture(url: () => string | null | undefined) {
	const first = url();
	let ok = $state<string | undefined>(first && settled.get(first) ? first : undefined);
	// Whether it arrived while the face was showing the initial (worth a fade), rather than being there already.
	let arrived = $state(false);
	$effect(() => {
		const u = url();
		if (!u) {
			ok = undefined;
			return;
		}
		const known = settled.get(u);
		if (known !== undefined) {
			ok = known ? u : undefined;
			return;
		}
		ok = undefined;
		let live = true;
		probePicture(u).then((loaded) => {
			if (!live || !loaded) return;
			ok = u;
			arrived = true;
		});
		return () => {
			live = false;
		};
	});
	return {
		get current() {
			return ok;
		},
		get arrived() {
			return arrived;
		},
	};
}
