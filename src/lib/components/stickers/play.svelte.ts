/** A sticker's press, replayed on every press: off, then on again on the next frame. */
export function createPlay() {
	let playing = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;
	return {
		get playing() {
			return playing;
		},
		play() {
			clearTimeout(timer);
			playing = false;
			requestAnimationFrame(() => {
				playing = true;
				timer = setTimeout(() => (playing = false), 640);
			});
		},
	};
}
