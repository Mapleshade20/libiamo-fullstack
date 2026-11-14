import { TURNSTILE_SECRET_KEY, TURNSTILE_SITE_KEY } from "$app/env/private";

/** The header a call to a protected Better Auth endpoint carries the Turnstile token in. */
export const CAPTCHA_HEADER = "x-captcha-response";
/**
 * The signed-out endpoints that create an account, sign in, send mail to a typed-in address or set a password. The
 * signed-in ones (changing the address or the password) already stand behind a session that passed here.
 */
export const CAPTCHA_PROTECTED_PATHS = ["/sign-up/email", "/sign-in/email", "/request-password-reset", "/reset-password", "/send-verification-email"];

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Both keys, or null when captcha is off (development, tests). Half a configuration refuses to start. */
export function captchaKeys(): { siteKey: string; secretKey: string } | null {
	if (!TURNSTILE_SITE_KEY && !TURNSTILE_SECRET_KEY) return null;
	if (!TURNSTILE_SITE_KEY || !TURNSTILE_SECRET_KEY) throw new Error("Set both TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY, or neither");
	return { siteKey: TURNSTILE_SITE_KEY, secretKey: TURNSTILE_SECRET_KEY };
}

/** Whether `token` is a fresh, unused pass. Every failure, the network's included, is a no. */
export async function verifyCaptcha(secretKey: string, token: string | null | undefined, remoteIp?: string | null): Promise<boolean> {
	if (!token) return false;
	try {
		const response = await fetch(SITEVERIFY_URL, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ secret: secretKey, response: token, ...(remoteIp ? { remoteip: remoteIp } : {}) }),
			signal: AbortSignal.timeout(10_000),
		});
		if (!response.ok) {
			console.error(`captcha: siteverify answered HTTP ${response.status}`);
			return false;
		}
		return ((await response.json()) as { success?: unknown }).success === true;
	} catch (error) {
		console.error("captcha: verification failed", error);
		return false;
	}
}
