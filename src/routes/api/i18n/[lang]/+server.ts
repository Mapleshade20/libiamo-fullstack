import source from "#lib/i18n/catalog/source.json";
import ui from "#lib/i18n/catalog/ui.json";

// The interface strings of one language (catalog/ui.json, written by the i18n script). The hand-written English and
// Chinese (catalog/source.json) win, so a string added there shows at once, before the other languages are translated.
export function GET({ params }) {
	const all: Record<string, Record<string, string>> = ui;
	const src: Record<string, Record<string, string>> = source;
	return Response.json({ ...(all[params.lang] ?? all.en), ...(src[params.lang] ?? {}) });
}
