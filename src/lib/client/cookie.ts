/** Keeps a small choice of this device's where the server reads it before rendering (a year). The Cookie Store API is
 *  not in every browser the app supports yet. */
export function keepCookie(name: string, value: string) {
	// biome-ignore lint/suspicious/noDocumentCookie: a plain name and value the server reads; see above.
	document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
}
