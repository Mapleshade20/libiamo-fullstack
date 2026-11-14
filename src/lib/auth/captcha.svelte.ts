/*
 * The Turnstile pass the signed-out forms send with their request (lib/server/auth/captcha.ts). The widget lives in the
 * auth pages' layout, out of sight unless Cloudflare wants a click; each pass is good once, so it is renewed after use.
 */
export const captcha = $state<{ siteKey: string | null; token: string | null; reset: (() => void) | null }>({
	siteKey: null,
	token: null,
	reset: null,
});

/** The header for a protected call, and a fresh pass for the next one. */
export function captchaHeaders(): Record<string, string> {
	if (!captcha.siteKey) return {};
	const token = captcha.token;
	captcha.token = null;
	captcha.reset?.();
	return token ? { "x-captcha-response": token } : {};
}
