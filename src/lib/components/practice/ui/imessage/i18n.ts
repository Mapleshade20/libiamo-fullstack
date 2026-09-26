import type { LanguageCode } from "$lib/constants";

/** iMessage's own vocabulary; lifecycle copy comes from `practice.*` in `$lib/i18n`. */
export type IMessageText = {
	messages: string;
	messagePlaceholder: string;
	startConversation: string;
	read: string;
	delivered: string;
	typing: string;
	back: string;
	now: string;
};

export const i18n: Record<LanguageCode, IMessageText> = {
	en: {
		messages: "Messages",
		messagePlaceholder: "iMessage",
		startConversation: "Start a conversation",
		read: "Read",
		delivered: "Delivered",
		typing: "Typing…",
		back: "Back",
		now: "now",
	},
	es: {
		messages: "Mensajes",
		messagePlaceholder: "iMessage",
		startConversation: "Inicia una conversación",
		read: "Leído",
		delivered: "Entregado",
		typing: "Escribiendo…",
		back: "Atrás",
		now: "ahora",
	},
	fr: {
		messages: "Messages",
		messagePlaceholder: "iMessage",
		startConversation: "Commencer une conversation",
		read: "Lu",
		delivered: "Distribué",
		typing: "En train d’écrire…",
		back: "Retour",
		now: "maintenant",
	},
	ja: {
		messages: "メッセージ",
		messagePlaceholder: "iMessage",
		startConversation: "会話を始める",
		read: "既読",
		delivered: "配信済み",
		typing: "入力中…",
		back: "戻る",
		now: "今",
	},
};
