/**
 * Mail providers that do not hand out throwaway addresses. Every new account and every email
 * change must use one of these, which keeps bulk-registered accounts off the shared trial.
 */
export const TRUSTED_EMAIL_DOMAINS = [
	"126.com",
	"163.com",
	"microsoft.com",
	"apple.com",
	"gmail.com",
	"qq.com",
	"foxmail.com",
	"sina.cn",
	"sina.com",
	"yahoo.com",
] as const;

/** The full list, for the hint beside an email field; rejections stay short and point back to it. */
export const ACCEPTED_EMAIL_PROVIDERS_HINT = "We accept Gmail, Apple, Microsoft, Yahoo, QQ, Foxmail, 126, 163, Sina and school (edu) addresses.";

export const UNTRUSTED_EMAIL_DOMAIN_MESSAGE = "This email provider is not accepted.";

/**
 * Whether `email` is on a trusted domain: one of the list above exactly, or an educational domain,
 * meaning `edu` is its top-level label (`mit.edu`) or the label right before a country code
 * (`pku.edu.cn`, `cs.ox.edu.au`). Subdomains of the listed providers are not trusted.
 */
export function isTrustedEmailDomain(email: string): boolean {
	const at = email.lastIndexOf("@");
	if (at <= 0) return false;
	const domain = email
		.slice(at + 1)
		.trim()
		.toLowerCase()
		.replace(/\.$/, "");
	if ((TRUSTED_EMAIL_DOMAINS as readonly string[]).includes(domain)) return true;

	const labels = domain.split(".");
	if (labels.some((label) => !label)) return false;
	const last = labels.length - 1;
	if (last >= 1 && labels[last] === "edu") return true;
	// `edu.<country>`, never `edu.com` and the like, which anyone can register under.
	return last >= 2 && labels[last - 1] === "edu" && /^[a-z]{2}$/.test(labels[last]);
}

/**
 * The mailbox an address delivers to, for granting the shared trial once per mailbox. Everything
 * after `+` is a subaddress on nearly every provider, and Gmail also ignores dots in the local part,
 * so `j.ohn+1@gmail.com` and `john@gmail.com` share one key. Never use it as the login address.
 */
export function trialEmailKey(email: string): string {
	const normalized = email.trim().toLowerCase();
	const at = normalized.lastIndexOf("@");
	if (at <= 0) return normalized;
	const domain = normalized.slice(at + 1).replace(/\.$/, "");
	const local = normalized.slice(0, at).split("+")[0];
	if (domain === "gmail.com" || domain === "googlemail.com") {
		return `${local.replaceAll(".", "")}@gmail.com`;
	}
	return `${local}@${domain}`;
}
