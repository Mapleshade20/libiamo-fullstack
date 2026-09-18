/** One active editor per surface. Tokens prevent an old editor releasing a new owner. */
export function createHintOwnership() {
	let owner: { token: symbol; dismiss: () => void } | undefined;
	return {
		claim(dismiss: () => void) {
			const previous = owner;
			owner = undefined;
			previous?.dismiss();
			const token = Symbol("hint-owner");
			owner = { token, dismiss };
			return token;
		},
		release(token: symbol) {
			if (owner?.token === token) owner = undefined;
		},
	};
}
