/* Sites a piece can be for, with their cover colours (light stamp, dark band) and drawing. */
export type SiteArt = "quill" | "bubble" | "letter" | "hash" | "chat" | "cards";
export const SITES: Record<string, { tone: string; deep: string; art: SiteArt }> = {
	AO3: { tone: "#ebcece", deep: "#5c2f2b", art: "quill" },
	Reddit: { tone: "#e3dacc", deep: "#6a4a2c", art: "bubble" },
	Email: { tone: "#cde2fb", deep: "#2f4660", art: "letter" },
	Discord: { tone: "#dfdbfd", deep: "#3a3955", art: "hash" },
	iMessage: { tone: "#bcd1ca", deep: "#33483f", art: "chat" },
	Translate: { tone: "#cbcadb", deep: "#4a4458", art: "cards" },
};
export const siteOf = (name: string | undefined) =>
	SITES[name ?? ""] ??
	SITES[
		Object.keys(SITES).find((k) =>
			String(name ?? "")
				.toLowerCase()
				.includes(k.toLowerCase()),
		) ?? "Email"
	];
