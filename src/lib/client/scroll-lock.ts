let lockDepth = 0;
let snapshot: {
	scrollY: number;
	bodyPosition: string;
	bodyTop: string;
	bodyLeft: string;
	bodyRight: string;
	bodyWidth: string;
	bodyOverflow: string;
	bodyPaddingRight: string;
	htmlOverflow: string;
	htmlOverscrollBehavior: string;
} | null = null;

export function lockBodyScroll() {
	if (typeof window === "undefined" || typeof document === "undefined") return () => {};

	let unlocked = false;

	if (lockDepth === 0) {
		const { body, documentElement } = document;
		const scrollY = window.scrollY;
		const scrollbarWidth = Math.max(0, window.innerWidth - documentElement.clientWidth);

		snapshot = {
			scrollY,
			bodyPosition: body.style.position,
			bodyTop: body.style.top,
			bodyLeft: body.style.left,
			bodyRight: body.style.right,
			bodyWidth: body.style.width,
			bodyOverflow: body.style.overflow,
			bodyPaddingRight: body.style.paddingRight,
			htmlOverflow: documentElement.style.overflow,
			htmlOverscrollBehavior: documentElement.style.overscrollBehavior,
		};

		body.style.position = "fixed";
		body.style.top = `-${scrollY}px`;
		body.style.left = "0";
		body.style.right = "0";
		body.style.width = "100%";
		body.style.overflow = "hidden";
		if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
		documentElement.style.overflow = "hidden";
		documentElement.style.overscrollBehavior = "none";
	}

	lockDepth += 1;

	return () => {
		if (unlocked) return;
		unlocked = true;

		lockDepth = Math.max(0, lockDepth - 1);
		if (lockDepth > 0 || !snapshot) return;

		const { body, documentElement } = document;
		const restore = snapshot;
		snapshot = null;

		body.style.position = restore.bodyPosition;
		body.style.top = restore.bodyTop;
		body.style.left = restore.bodyLeft;
		body.style.right = restore.bodyRight;
		body.style.width = restore.bodyWidth;
		body.style.overflow = restore.bodyOverflow;
		body.style.paddingRight = restore.bodyPaddingRight;
		documentElement.style.overflow = restore.htmlOverflow;
		documentElement.style.overscrollBehavior = restore.htmlOverscrollBehavior;
		window.scrollTo(0, restore.scrollY);
	};
}
