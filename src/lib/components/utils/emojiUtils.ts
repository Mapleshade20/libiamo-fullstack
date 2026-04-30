import EmojiConvertor from "emoji-js";

const emojiConvertor = new EmojiConvertor();
emojiConvertor.replace_mode = "unified";
emojiConvertor.allow_native = true;

export function unicodeEmojiToShortcode(text: string): string {
	if (!text) return "";
	return emojiConvertor.replace_unified(text);
}

export function shortcodeToUnicodeEmoji(text: string): string {
	if (!text) return "";
	return emojiConvertor.replace_colons(text);
}

export function normalizeEmojiTextForStorage(text: string): string {
	if (!text) return "";
	return unicodeEmojiToShortcode(text);
}

export function normalizeEmojiTextForDisplay(text: string): string {
	if (!text) return "";
	return shortcodeToUnicodeEmoji(text);
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

export function emojiToStorageValue(emoji: string): string {
	if (!emoji) return "";
	return normalizeEmojiTextForStorage(emoji);
}

export function hasEmojiShortcode(text: string): boolean {
	if (!text) return false;
	return /:[a-z0-9_+-]+:/i.test(text);
}

export function normalizeMixedEmojiText(text: string): string {
	if (!text) return "";
	return normalizeEmojiTextForStorage(text);
}
