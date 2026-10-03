type Environment = Record<string, string | undefined>;

/** Cloudflare Turnstile keys. Without both, captcha is off (local development, tests). */
export type CaptchaConfig = { siteKey: string; secretKey: string };

/** The form field the Turnstile widget fills in. */
export const CAPTCHA_FORM_FIELD = "cf-turnstile-response";
/** The header a direct HTTP call to a protected Better Auth endpoint must carry the token in. */
export const CAPTCHA_HEADER = "x-captcha-response";
/** Better Auth endpoints that send mail to a typed-in address (a signed-in user's new email included), create an account, sign in or set a password. */
export const CAPTCHA_PROTECTED_PATHS = [
	"/sign-up/email",
	"/sign-in/email",
	"/request-password-reset",
	"/reset-password",
	"/send-verification-email",
	"/change-email",
	"/change-password",
] as const;

export const CAPTCHA_FAILED_MESSAGE = "We could not confirm you are human. Please complete the check and try again.";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 10_000;

export function captchaConfig(env: Environment): CaptchaConfig | null {
	const siteKey = env.TURNSTILE_SITE_KEY?.trim();
	const secretKey = env.TURNSTILE_SECRET_KEY?.trim();
	return siteKey && secretKey ? { siteKey, secretKey } : null;
}

/** Asks Cloudflare whether `token` is a fresh, unused pass. Every failure, network included, is a no. */
export async function verifyCaptcha(config: CaptchaConfig, token: string | null | undefined, remoteIp?: string | null): Promise<boolean> {
	if (!token) return false;
	try {
		const response = await fetch(SITEVERIFY_URL, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ secret: config.secretKey, response: token, ...(remoteIp ? { remoteip: remoteIp } : {}) }),
			signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
		});
		if (!response.ok) {
			console.error(`[captcha] Turnstile siteverify answered HTTP ${response.status}`);
			return false;
		}
		const body = (await response.json()) as { success?: unknown };
		return body.success === true;
	} catch (error) {
		console.error("[captcha] Turnstile verification failed", error);
		return false;
	}
}

/** For form actions that call `auth.api` directly: true when captcha is off or the widget's token checks out. */
export function verifyCaptchaField(
	env: Environment,
	formData: FormData,
	event: { request: Request; getClientAddress: () => string },
): Promise<boolean> {
	const config = captchaConfig(env);
	if (!config) return Promise.resolve(true);
	const token = formData.get(CAPTCHA_FORM_FIELD);
	let remoteIp: string | null = null;
	try {
		remoteIp = event.getClientAddress();
	} catch {
		// Not every adapter knows the client address; Turnstile treats it as optional.
	}
	return verifyCaptcha(config, typeof token === "string" ? token : null, remoteIp);
}
