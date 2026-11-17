import { afterEach, expect, it, vi } from "vitest";
import { PICTURE_WAIT_MS, probePicture } from "#lib/account/picture.svelte.ts";

/** An image that loads, fails or never answers, as the test says. */
function stubImage(answer: "load" | "error" | "never", after = 10) {
	const made: { src: string }[] = [];
	class FakeImage {
		onload: (() => void) | null = null;
		onerror: (() => void) | null = null;
		naturalWidth = 0;
		referrerPolicy = "";
		#src = "";
		constructor() {
			made.push(this);
		}
		get src() {
			return this.#src;
		}
		set src(v: string) {
			this.#src = v;
			if (!v || answer === "never") return;
			setTimeout(() => {
				if (answer === "load") {
					this.naturalWidth = 168;
					this.onload?.();
				} else this.onerror?.();
			}, after);
		}
	}
	vi.stubGlobal("Image", FakeImage);
	return made;
}
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

it("shows a picture that loads in time, asking for it once", async () => {
	vi.useFakeTimers();
	const made = stubImage("load");
	const a = probePicture("https://gravatar.com/avatar/a");
	const b = probePicture("https://gravatar.com/avatar/a");
	await vi.advanceTimersByTimeAsync(20);
	expect(await a).toBe(true);
	expect(await b).toBe(true);
	expect(made).toHaveLength(1);
});

it("keeps the initial when Gravatar has no picture, or does not answer in time", async () => {
	vi.useFakeTimers();
	stubImage("error");
	const none = probePicture("https://gravatar.com/avatar/none");
	await vi.advanceTimersByTimeAsync(20);
	expect(await none).toBe(false);

	const made = stubImage("never");
	const slow = probePicture("https://gravatar.com/avatar/slow");
	await vi.advanceTimersByTimeAsync(PICTURE_WAIT_MS);
	expect(await slow).toBe(false);
	// Given up on: the browser stops loading it.
	expect(made[0].src).toBe("");
});
