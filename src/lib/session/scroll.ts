import { reduced } from "./clock";
import { clamp } from "./text";

/* Programmatic scrolling glides slowly and stops the moment the learner scrolls themselves. */
const glides = new Map<Element, () => void>();
export function glide(box: HTMLElement, top: number): Promise<void> {
	top = clamp(top, 0, box.scrollHeight - box.clientHeight);
	glides.get(box)?.();
	const from = box.scrollTop;
	const d = top - from;
	if (Math.abs(d) < 2) return Promise.resolve();
	if (reduced()) {
		box.scrollTop = top;
		return Promise.resolve();
	}
	const dur = clamp(420 + Math.abs(d) * 0.5, 520, 950);
	return new Promise((done) => {
		let raf = 0;
		const t0 = performance.now();
		const stop = () => {
			cancelAnimationFrame(raf);
			box.removeEventListener("wheel", stop);
			box.removeEventListener("touchstart", stop);
			if (glides.get(box) === stop) glides.delete(box);
			done();
		};
		const step = (now: number) => {
			const k = Math.min(1, (now - t0) / dur);
			box.scrollTop = from + d * (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);
			if (k < 1) raf = requestAnimationFrame(step);
			else stop();
		};
		box.addEventListener("wheel", stop, { passive: true });
		box.addEventListener("touchstart", stop, { passive: true });
		glides.set(box, stop);
		raf = requestAnimationFrame(step);
	});
}
/** Jump without gliding (and stop a glide under way). */
export function jump(box: HTMLElement, top: number) {
	glides.get(box)?.();
	box.scrollTop = clamp(top, 0, box.scrollHeight - box.clientHeight);
}
