/**
 * Mail providers that do not hand out throwaway addresses. Every new account and every email
 * change must use one of these, which keeps bulk-registered accounts off the shared trial.
 */
export const TRUSTED_EMAIL_DOMAINS = [
	"126.com",
	"163.com",
	"icloud.com",
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
export const ACCEPTED_EMAIL_PROVIDERS_HINT =
	"We accept Gmail, iCloud, Apple, Microsoft, Yahoo, QQ, Foxmail, 126, 163, Sina and school (edu) addresses.";

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
