import type { LanguageCode } from "$lib/constants";

/** AO3's own vocabulary; lifecycle copy comes from `practice.*` in `$lib/i18n`. */
export type Ao3Text = Record<
	| "commentAs"
	| "plainText"
	| "leaveComment"
	| "replyTo"
	| "cancelReply"
	| "comment"
	| "reply"
	| "kudos"
	| "bookmark"
	| "hideComments"
	| "comments"
	| "charactersLeft"
	| "top"
	| "kudosLeft",
	string
>;

export const i18n: Record<LanguageCode, Ao3Text> = {
	en: {
		commentAs: "Comment as",
		plainText: "Plain text with limited HTML",
		leaveComment: "Leave a comment...",
		replyTo: "Replying to",
		cancelReply: "Cancel reply",
		comment: "Comment",
		reply: "Reply",
		kudos: "Kudos ♥",
		bookmark: "Bookmark",
		hideComments: "Hide Comments",
		comments: "Comments",
		charactersLeft: "characters left",
		top: "↑ Top",
		kudosLeft: "{names}, and many guests left kudos on this work!",
	},
	es: {
		commentAs: "Comentar como",
		plainText: "Texto plano con HTML limitado",
		leaveComment: "Deja un comentario...",
		replyTo: "Respondiendo a",
		cancelReply: "Cancelar respuesta",
		comment: "Comentar",
		reply: "Responder",
		kudos: "Kudos ♥",
		bookmark: "Marcador",
		hideComments: "Ocultar comentarios",
		comments: "Comentarios",
		charactersLeft: "caracteres restantes",
		top: "↑ Arriba",
		kudosLeft: "¡{names} y muchos invitados dejaron kudos en esta obra!",
	},
	fr: {
		commentAs: "Commenter en tant que",
		plainText: "Texte brut avec HTML limité",
		leaveComment: "Laisser un commentaire...",
		replyTo: "Réponse à",
		cancelReply: "Annuler la réponse",
		comment: "Commenter",
		reply: "Répondre",
		kudos: "Kudos ♥",
		bookmark: "Marque-page",
		hideComments: "Masquer les commentaires",
		comments: "Commentaires",
		charactersLeft: "caractères restants",
		top: "↑ Haut",
		kudosLeft: "{names} et de nombreux invités ont laissé des kudos sur cette œuvre !",
	},
	ja: {
		commentAs: "コメント投稿者",
		plainText: "限定的なHTMLつきプレーンテキスト",
		leaveComment: "コメントを残す...",
		replyTo: "返信先",
		cancelReply: "返信をキャンセル",
		comment: "コメント",
		reply: "返信",
		kudos: "Kudos ♥",
		bookmark: "ブックマーク",
		hideComments: "コメントを非表示",
		comments: "コメント",
		charactersLeft: "文字残り",
		top: "↑ トップへ",
		kudosLeft: "{names}と多くのゲストがこの作品にKudosを送りました！",
	},
};
