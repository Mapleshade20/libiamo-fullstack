import EmojiConvertor from "emoji-js";

const emojiConvertor = new EmojiConvertor();
emojiConvertor.replace_mode = "unified";
emojiConvertor.allow_native = true;

export function normalizeEmojiTextForDisplay(text: string): string {
	if (!text) return "";
	return emojiConvertor.replace_colons(text);
}

export function extractEmojiFromPickerEvent(event: CustomEvent | Event): string {
	const detail = (event as CustomEvent).detail as
		| {
				unicode?: string;
				variation?: string;
				skinTone?: string;
				skinToneEmoji?: string;
				emoji?: string;
		  }
		| undefined;

	if (!detail) return "";

	if (detail.unicode) return detail.unicode;

	if (detail.emoji) return detail.emoji;

	if (detail.skinToneEmoji) return detail.skinToneEmoji;

	return "";
}
