export type FeaturedGame = { name: string; tagline: string; color: string; abbr: string };

export const FEATURED_GAMES: FeaturedGame[] = [
	{ name: "Element Synergy", tagline: "Create harmony!", color: "#FF4500", abbr: "ES" },
	{ name: "LETTERSET", tagline: "Word challenge", color: "#0079D3", abbr: "LS" },
	{ name: "Pixelary", tagline: "Draw & guess", color: "#46D160", abbr: "PX" },
	{ name: "MiniGawf", tagline: "Mini golf time", color: "#FFB000", abbr: "MG" },
];

export const RELATED_SUBREDDITS = [
	"AskReddit",
	"worldnews",
	"science",
	"funny",
	"pics",
	"todayilearned",
	"technology",
	"movies",
	"sports",
	"gaming",
	"news",
	"explainlikeimfive",
	"relationships",
	"travel",
	"food",
];

export const COMMUNITY_RULES = [
	"Be respectful and civil to others",
	"No spam or unsolicited self-promotion",
	"Keep posts relevant to the community",
	"No doxxing or sharing personal info",
	"Follow Reddit's site-wide content policy",
];

export const NAV_ITEMS = [
	{ icon: "home", key: "home" },
	{ icon: "trending-up", key: "popular" },
	{ icon: "layers", key: "all" },
	{ icon: "search", key: "explore" },
] as const;
