import type { LanguageCode } from "$lib/constants";

/** Discord's own vocabulary; lifecycle copy comes from `practice.*` in `$lib/i18n`. */
export type DiscordText = {
	textChannels: string;
	general: string;
	online: string;
	offline: string;
	members: string;
	channels: string;
	servers: string;
	addServer: string;
	mute: string;
	settings: string;
	emoji: string;
	messagePlaceholder: string;
	mention: string;
	typing: string;
};

export const i18n: Record<LanguageCode, DiscordText> = {
	en: {
		textChannels: "TEXT CHANNELS",
		general: "general",
		online: "Online",
		offline: "Offline",
		members: "Members",
		channels: "Channels",
		servers: "Servers",
		addServer: "Add a Server",
		mute: "Mute",
		settings: "User Settings",
		emoji: "Select emoji",
		messagePlaceholder: "Message #{channel}",
		mention: "Mention @{name}",
		typing: "{name} is typing…",
	},
	es: {
		textChannels: "CANALES DE TEXTO",
		general: "general",
		online: "En línea",
		offline: "Desconectado",
		members: "Miembros",
		channels: "Canales",
		servers: "Servidores",
		addServer: "Añadir un servidor",
		mute: "Silenciar",
		settings: "Ajustes de usuario",
		emoji: "Elegir emoji",
		messagePlaceholder: "Enviar mensaje a #{channel}",
		mention: "Mencionar a @{name}",
		typing: "{name} está escribiendo…",
	},
	fr: {
		textChannels: "SALONS TEXTUELS",
		general: "général",
		online: "En ligne",
		offline: "Hors ligne",
		members: "Membres",
		channels: "Salons",
		servers: "Serveurs",
		addServer: "Ajouter un serveur",
		mute: "Rendre muet",
		settings: "Paramètres utilisateur",
		emoji: "Choisir un emoji",
		messagePlaceholder: "Envoyer un message dans #{channel}",
		mention: "Mentionner @{name}",
		typing: "{name} est en train d’écrire…",
	},
	ja: {
		textChannels: "テキストチャンネル",
		general: "一般",
		online: "オンライン",
		offline: "オフライン",
		members: "メンバー",
		channels: "チャンネル",
		servers: "サーバー",
		addServer: "サーバーを追加",
		mute: "ミュート",
		settings: "ユーザー設定",
		emoji: "絵文字を選択",
		messagePlaceholder: "#{channel} へメッセージを送信",
		mention: "@{name} にメンション",
		typing: "{name}が入力中…",
	},
};
