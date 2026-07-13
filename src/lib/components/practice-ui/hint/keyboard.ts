type KeyboardCompositionState = Pick<KeyboardEvent, "isComposing" | "keyCode">;

export function isImeKeyboardEvent(event: KeyboardCompositionState) {
	return event.isComposing || event.keyCode === 229;
}
