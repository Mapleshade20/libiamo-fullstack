import type { LanguageCode } from "$lib/constants";

/** Mail's own vocabulary; lifecycle copy comes from `practice.*` in `$lib/i18n`. */
export type MailText = {
	mailboxes: string;
	inbox: string;
	sent: string;
	newMessage: string;
	reply: string;
	cancel: string;
	to: string;
	subject: string;
	noSubject: string;
	composePlaceholder: string;
	noMessages: string;
	noSelection: string;
	unread: string;
};

export const i18n: Record<LanguageCode, MailText> = {
	en: {
		mailboxes: "Mailboxes",
		inbox: "Inbox",
		sent: "Sent",
		newMessage: "New Message",
		reply: "Reply",
		cancel: "Cancel",
		to: "To:",
		subject: "Subject:",
		noSubject: "No Subject",
		composePlaceholder: "Write your email…",
		noMessages: "No Messages",
		noSelection: "No Message Selected",
		unread: "{count} unread",
	},
	es: {
		mailboxes: "Buzones",
		inbox: "Recibidos",
		sent: "Enviados",
		newMessage: "Mensaje nuevo",
		reply: "Responder",
		cancel: "Cancelar",
		to: "Para:",
		subject: "Asunto:",
		noSubject: "Sin asunto",
		composePlaceholder: "Escribe tu correo…",
		noMessages: "No hay mensajes",
		noSelection: "Ningún mensaje seleccionado",
		unread: "{count} sin leer",
	},
	fr: {
		mailboxes: "Boîtes aux lettres",
		inbox: "Réception",
		sent: "Envoyés",
		newMessage: "Nouveau message",
		reply: "Répondre",
		cancel: "Annuler",
		to: "À :",
		subject: "Objet :",
		noSubject: "Sans objet",
		composePlaceholder: "Rédigez votre e-mail…",
		noMessages: "Aucun message",
		noSelection: "Aucun message sélectionné",
		unread: "{count} non lu(s)",
	},
	ja: {
		mailboxes: "メールボックス",
		inbox: "受信",
		sent: "送信済み",
		newMessage: "新規メッセージ",
		reply: "返信",
		cancel: "キャンセル",
		to: "宛先:",
		subject: "件名:",
		noSubject: "件名なし",
		composePlaceholder: "メールを書く…",
		noMessages: "メッセージなし",
		noSelection: "メッセージが選択されていません",
		unread: "未読 {count} 件",
	},
};
