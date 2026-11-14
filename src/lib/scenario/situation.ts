import type { Situation } from "./types.ts";

/** A situation as plain text, for the revision to read as the piece's context. */
export function situationText(s: Situation): string {
	switch (s.kind) {
		case "ao3":
			return `AO3 work "${s.work}" by ${s.author}, ${s.chapter}.\n\n${s.excerpt}${s.note ? `\n\nAuthor's note: ${s.note}` : ""}`;
		case "reddit":
			return `r/${s.sub}, post by ${s.author}: ${s.title}\n\n${s.body}${s.comments.map((c) => `\n\n${c.author}: ${c.body}`).join("")}`;
		case "email":
			return `Email from ${s.from}. Subject: ${s.subject}\n\n${s.body}`;
		case "chat":
			return `${s.place}\n${s.messages.map((m) => `${m.author}: ${m.text}`).join("\n")}`;
		case "translate":
			return `To translate (${s.brief}):\n\n${s.source}`;
	}
}
