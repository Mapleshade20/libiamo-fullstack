import type { LanguageCode } from "$lib/constants";

/** Reddit's own vocabulary; lifecycle copy comes from `practice.*` in `$lib/i18n`. */
export type RedditText = Record<
	| "joinConversation"
	| "cancelReply"
	| "sendMessage"
	| "replyPlaceholder"
	| "posted"
	| "comments"
	| "share"
	| "save"
	| "award"
	| "points"
	| "reply"
	| "home"
	| "popular"
	| "all"
	| "explore"
	| "createCommunity"
	| "gamesOnReddit"
	| "discoverMore"
	| "customFeeds"
	| "createCustomFeed"
	| "resources"
	| "aboutReddit"
	| "advertise"
	| "helpCenter"
	| "communityRules"
	| "joinButton"
	| "membersLabel"
	| "online"
	| "relatedCommunities"
	| "sortBest"
	| "searchComments"
	| "communities"
	| "searchReddit"
	| "menu"
	| "create"
	| "live"
	| "notifications"
	| "upvote"
	| "downvote"
	| "collapse"
	| "expand"
	| "more"
	| "open"
	| "created"
	| "replyCount",
	string
>;

export const i18n: Record<LanguageCode, RedditText> = {
	en: {
		joinConversation: "What are your thoughts?",
		cancelReply: "Cancel",
		sendMessage: "Post Comment",
		replyPlaceholder: "Reply to u/{author}",
		posted: "Posted by",
		comments: "Comments",
		share: "Share",
		save: "Save",
		award: "Award",
		points: "points",
		reply: "Reply",
		home: "Home",
		popular: "Popular",
		all: "All",
		explore: "Explore",
		createCommunity: "Create Community",
		gamesOnReddit: "Games on Reddit",
		discoverMore: "Discover More",
		customFeeds: "Custom Feeds",
		createCustomFeed: "Create a custom feed",
		resources: "Resources",
		aboutReddit: "About Reddit",
		advertise: "Advertise",
		helpCenter: "Help Center",
		communityRules: "Community Rules",
		joinButton: "Join",
		membersLabel: "Members",
		online: "Online",
		relatedCommunities: "Related Communities",
		sortBest: "Best",
		searchComments: "Search Comments",
		communities: "Communities",
		searchReddit: "Search Reddit",
		menu: "Menu",
		create: "Create",
		live: "Live",
		notifications: "Notifications",
		upvote: "Upvote",
		downvote: "Downvote",
		collapse: "Collapse thread",
		expand: "Expand thread",
		more: "More options",
		open: "Open",
		created: "Created {year}",
		replyCount: "({count} replies)",
	},
	es: {
		joinConversation: "¿Cuáles son tus pensamientos?",
		cancelReply: "Cancelar",
		sendMessage: "Publicar comentario",
		replyPlaceholder: "Responder a u/{author}",
		posted: "Publicado por",
		comments: "Comentarios",
		share: "Compartir",
		save: "Guardar",
		award: "Premio",
		points: "puntos",
		reply: "Responder",
		home: "Inicio",
		popular: "Popular",
		all: "Todo",
		explore: "Explorar",
		createCommunity: "Crear comunidad",
		gamesOnReddit: "Games on Reddit",
		discoverMore: "Descubrir más",
		customFeeds: "Fuentes personalizadas",
		createCustomFeed: "Crear fuente personalizada",
		resources: "Recursos",
		aboutReddit: "Acerca de Reddit",
		advertise: "Publicidad",
		helpCenter: "Centro de ayuda",
		communityRules: "Reglas de la comunidad",
		joinButton: "Unirse",
		membersLabel: "Miembros",
		online: "En línea",
		relatedCommunities: "Comunidades relacionadas",
		sortBest: "Mejor",
		searchComments: "Buscar comentarios",
		communities: "Comunidades",
		searchReddit: "Buscar en Reddit",
		menu: "Menú",
		create: "Crear",
		live: "En directo",
		notifications: "Notificaciones",
		upvote: "Votar a favor",
		downvote: "Votar en contra",
		collapse: "Contraer hilo",
		expand: "Expandir hilo",
		more: "Más opciones",
		open: "Abrir",
		created: "Creada en {year}",
		replyCount: "({count} respuestas)",
	},
	fr: {
		joinConversation: "Quelle est votre opinion ?",
		cancelReply: "Annuler",
		sendMessage: "Publier le commentaire",
		replyPlaceholder: "Répondre à u/{author}",
		posted: "Publié par",
		comments: "Commentaires",
		share: "Partager",
		save: "Sauvegarder",
		award: "Récompense",
		points: "points",
		reply: "Répondre",
		home: "Accueil",
		popular: "Populaire",
		all: "Tout",
		explore: "Explorer",
		createCommunity: "Créer une communauté",
		gamesOnReddit: "Games on Reddit",
		discoverMore: "Découvrir plus",
		customFeeds: "Flux personnalisés",
		createCustomFeed: "Créer un flux personnalisé",
		resources: "Ressources",
		aboutReddit: "À propos de Reddit",
		advertise: "Faire de la publicité",
		helpCenter: "Centre d'aide",
		communityRules: "Règles de la communauté",
		joinButton: "Rejoindre",
		membersLabel: "Membres",
		online: "En ligne",
		relatedCommunities: "Communautés liées",
		sortBest: "Meilleur",
		searchComments: "Rechercher des commentaires",
		communities: "Communautés",
		searchReddit: "Rechercher sur Reddit",
		menu: "Menu",
		create: "Créer",
		live: "En direct",
		notifications: "Notifications",
		upvote: "Vote positif",
		downvote: "Vote négatif",
		collapse: "Réduire le fil",
		expand: "Déplier le fil",
		more: "Plus d’options",
		open: "Ouvrir",
		created: "Créée en {year}",
		replyCount: "({count} réponses)",
	},
	ja: {
		joinConversation: "あなたの考えは？",
		cancelReply: "キャンセル",
		sendMessage: "コメントを投稿",
		replyPlaceholder: "u/{author}に返信",
		posted: "投稿者：",
		comments: "コメント",
		share: "シェア",
		save: "保存",
		award: "アワード",
		points: "ポイント",
		reply: "返信",
		home: "ホーム",
		popular: "人気",
		all: "すべて",
		explore: "探索",
		createCommunity: "コミュニティを作成",
		gamesOnReddit: "Games on Reddit",
		discoverMore: "もっと発見",
		customFeeds: "カスタムフィード",
		createCustomFeed: "カスタムフィードを作成",
		resources: "リソース",
		aboutReddit: "Redditについて",
		advertise: "広告",
		helpCenter: "ヘルプセンター",
		communityRules: "コミュニティのルール",
		joinButton: "参加",
		membersLabel: "メンバー",
		online: "オンライン",
		relatedCommunities: "関連コミュニティ",
		sortBest: "ベスト",
		searchComments: "コメントを検索",
		communities: "コミュニティ",
		searchReddit: "Redditを検索",
		menu: "メニュー",
		create: "作成",
		live: "ライブ",
		notifications: "通知",
		upvote: "高評価",
		downvote: "低評価",
		collapse: "スレッドを折りたたむ",
		expand: "スレッドを展開",
		more: "その他のオプション",
		open: "開く",
		created: "{year}年に作成",
		replyCount: "（返信 {count} 件）",
	},
};
