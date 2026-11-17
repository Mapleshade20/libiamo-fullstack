/**
 * A request refused because nobody is signed in any more (signed out in another tab, the session expired, the password
 * changed on another device): the sign-in page, loaded whole, so nothing of the account stays in this tab. Throws, so
 * the caller stops where it is.
 */
export function leaveIfSignedOut(r: Response): Response {
	if (r.status !== 401) return r;
	location.assign("/sign-in");
	throw new DOMException("Signed out", "AbortError");
}
