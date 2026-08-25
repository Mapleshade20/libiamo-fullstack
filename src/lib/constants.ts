export const UI_VARIANTS = ["reddit", "apple_mail", "discord", "imessage", "ao3", "translator"] as const;
export type UiVariant = (typeof UI_VARIANTS)[number];

export const PRACTICE_UI_TEXT_MAX_LENGTH = 10000;
export const MAIL_TEXT_MAX_LENGTH = 50000;
export const MAIL_BODY_HTML_MAX_LENGTH = MAIL_TEXT_MAX_LENGTH * 10;
export const AUTH_EMAIL_MAX_LENGTH = 254;
export const AUTH_PASSWORD_MAX_LENGTH = 1024;
export const AUTH_TOKEN_MAX_LENGTH = 2048;
export const USER_NAME_MAX_LENGTH = 100;
export const USER_TEXT_MAX_LENGTH = 10000;
export const USER_LONG_TEXT_MAX_LENGTH = 50000;
export const BYOK_API_KEY_MAX_LENGTH = 2048;
export const BYOK_MODEL_MAX_LENGTH = 512;
export const BYOK_BASE_URL_MAX_LENGTH = 2048;
export const CLIENT_MESSAGE_ID_MAX_LENGTH = 256;
export const REVIEW_MAXIMUM_INTERVAL_DAYS = 36_500;

export const UI_VARIANT_LABELS: Record<UiVariant, string> = {
	reddit: "Reddit",
	apple_mail: "Apple Mail",
	discord: "Discord",
	imessage: "iMessage",
	ao3: "AO3",
	translator: "Translator",
};

export const BYOK_API_BASE_URLS = [
	"https://openrouter.ai/api/v1",
	"https://api.deepseek.com",
	"https://dashscope.aliyuncs.com/compatible-mode/v1",
	"https://api.hunyuan.cloud.tencent.com/v1",
	"https://qianfan.baidubce.com/v2",
	"https://open.bigmodel.cn/api/paas/v4",
	"https://api.moonshot.cn/v1",
	"https://api.minimaxi.com/v1",
	"https://ark.cn-beijing.volces.com/api/v3",
	"https://api.siliconflow.com/v1",
	"https://api-inference.modelscope.cn/v1",
	"https://api.stepfun.com/v1",
	"https://api.baichuan-ai.com/v1",
	"https://api.sensenova.cn/compatible-mode/v2",
	"https://spark-api-open.xf-yun.com/v1",
	"https://api.modelverse.cn/v1",
	"https://api.modelarts-maas.com/v1",
	"https://api.ppio.com/openai/v1",
	"https://cloud.infini-ai.com/maas/v1",
	"https://openai.qiniu.com/v1",
	"https://api.scnet.cn/api/llm/v1",
] as const;
export type ByokApiBaseUrl = (typeof BYOK_API_BASE_URLS)[number];

export const BYOK_API_BASE_URL_LABELS: Record<ByokApiBaseUrl, string> = {
	"https://openrouter.ai/api/v1": "OpenRouter",
	"https://api.deepseek.com": "DeepSeek",
	"https://dashscope.aliyuncs.com/compatible-mode/v1": "Alibaba Cloud Bailian / Qwen",
	"https://api.hunyuan.cloud.tencent.com/v1": "Tencent Hunyuan",
	"https://qianfan.baidubce.com/v2": "Baidu Qianfan",
	"https://open.bigmodel.cn/api/paas/v4": "Zhipu AI / GLM",
	"https://api.moonshot.cn/v1": "Kimi / Moonshot",
	"https://api.minimaxi.com/v1": "MiniMax",
	"https://ark.cn-beijing.volces.com/api/v3": "Volcengine Ark / Doubao",
	"https://api.siliconflow.com/v1": "SiliconFlow",
	"https://api-inference.modelscope.cn/v1": "ModelScope",
	"https://api.stepfun.com/v1": "StepFun",
	"https://api.baichuan-ai.com/v1": "Baichuan AI",
	"https://api.sensenova.cn/compatible-mode/v2": "SenseNova",
	"https://spark-api-open.xf-yun.com/v1": "iFlytek Spark",
	"https://api.modelverse.cn/v1": "UCloud ModelVerse",
	"https://api.modelarts-maas.com/v1": "Huawei Cloud ModelArts MaaS",
	"https://api.ppio.com/openai/v1": "PPIO",
	"https://cloud.infini-ai.com/maas/v1": "Infini-AI",
	"https://openai.qiniu.com/v1": "Qiniu AI",
	"https://api.scnet.cn/api/llm/v1": "SCNet",
};

export const LANGUAGE_CODES = ["en", "es", "fr", "ja"] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];

export const LANGUAGE_LABELS: Record<LanguageCode, string> = {
	en: "English",
	es: "Español",
	fr: "Français",
	ja: "日本語",
};

export const NATIVE_LANGUAGE_CODES = [
	"zh",
	"en",
	"hi",
	"es",
	"fr",
	"ar",
	"bn",
	"pt",
	"ru",
	"ur",
	"id",
	"de",
	"ja",
	"pa",
	"mr",
	"te",
	"tr",
	"ko",
	"vi",
	"ta",
	"it",
	"gu",
	"fa",
	"pl",
	"uk",
	"ml",
	"kn",
	"or",
	"my",
	"th",
] as const;
export type NativeLanguageCode = (typeof NATIVE_LANGUAGE_CODES)[number];

export function getNativeLanguageOptions(locale = "en"): { value: NativeLanguageCode; label: string }[] {
	let displayNames: Intl.DisplayNames | undefined;
	try {
		displayNames = new Intl.DisplayNames([locale], { type: "language" });
	} catch {
		displayNames = undefined;
	}

	return NATIVE_LANGUAGE_CODES.map((code) => ({
		value: code,
		label: displayNames?.of(code) ?? code.toUpperCase(),
	}));
}

const LANGUAGE_ENGLISH_NAMES: Record<LanguageCode, string> = {
	en: "English",
	es: "Spanish",
	fr: "French",
	ja: "Japanese",
};

let englishLanguageDisplayNames: Intl.DisplayNames | undefined;
try {
	englishLanguageDisplayNames = new Intl.DisplayNames(["en"], { type: "language" });
} catch {
	englishLanguageDisplayNames = undefined;
}

export function getLanguageEnglishName(code: string): string {
	const fallback = LANGUAGE_CODES.includes(code as LanguageCode) ? LANGUAGE_ENGLISH_NAMES[code as LanguageCode] : code;
	try {
		return englishLanguageDisplayNames?.of(code) ?? fallback;
	} catch {
		return fallback;
	}
}

export const INTERACTION_TYPES = ["chat", "translate"] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];

export const INTERACTION_TYPE_LABELS: Record<InteractionType, string> = {
	chat: "Chat",
	translate: "Translate",
};

export const URGENCIES = ["high", "medium", "low"] as const;
export type Urgency = (typeof URGENCIES)[number];

export const PRACTICE_SESSION_MAX_AGE_SECONDS = 48 * 60 * 60;

export type UrgencyPreset = {
	/** Mean of the exponential reply delay distribution (true MTTH). */
	replyMtthMs: number;
	/** Hard cap: a reply is force-delivered at this delay even if the sampled tail exceeds it. */
	replyCapMs: number;
	idleFollowUpDelayMs: number;
};

export const URGENCY_PRESETS: Record<Urgency, UrgencyPreset> = {
	high: {
		replyMtthMs: 30_000,
		replyCapMs: 1 * 60_000,
		idleFollowUpDelayMs: 60 * 60_000,
	},
	medium: {
		replyMtthMs: 2 * 60_000,
		replyCapMs: 8 * 60_000,
		idleFollowUpDelayMs: 12 * 60 * 60_000,
	},
	low: {
		replyMtthMs: 10 * 60_000,
		replyCapMs: 40 * 60_000,
		idleFollowUpDelayMs: 24 * 60 * 60_000,
	},
};

export const URGENCY_LABELS: Record<Urgency, string> = {
	high: "High — ~30 s (max 1 min)",
	medium: "Medium — ~2 min (max 8 min)",
	low: "Low — ~10 min (max 40 min)",
};

export const CADENCES = ["weekly", "daily", "none"] as const;
export type Cadence = (typeof CADENCES)[number];

export const FEEDBACK_LANGUAGE_MODES = ["native", "target"] as const;
export type FeedbackLanguageMode = (typeof FEEDBACK_LANGUAGE_MODES)[number];

export const TRANSLATION_WORKFLOW_PHASES = ["draft", "submitted", "correction", "second_draft", "transfer", "completed"] as const;
export type TranslationWorkflowPhase = (typeof TRANSLATION_WORKFLOW_PHASES)[number];
export const TRANSLATION_CANDIDATE_COUNT = 3;

export function resolveFeedbackLanguage(input: {
	preference: FeedbackLanguageMode;
	nativeLanguage?: string | null;
	targetLanguage: LanguageCode;
}): string {
	return input.preference === "native" && input.nativeLanguage ? input.nativeLanguage : input.targetLanguage;
}
