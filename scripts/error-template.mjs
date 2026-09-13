import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const BASE_PATH_PLACEHOLDER = "%libiamo.base%";

/** @param {string} value */
function escapeHtmlAttribute(value) {
	return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/**
 * @param {string} source
 * @param {string} base
 */
export function renderErrorTemplate(source, base) {
	const occurrences = source.split(BASE_PATH_PLACEHOLDER).length - 1;
	if (occurrences !== 1) {
		throw new Error(`Error template must contain ${BASE_PATH_PLACEHOLDER} exactly once; found ${occurrences}.`);
	}

	return source.replace(BASE_PATH_PLACEHOLDER, () => escapeHtmlAttribute(base));
}

/**
 * @param {{ sourceUrl: URL; outputUrl: URL; base: string }} options
 */
export function materializeErrorTemplate({ sourceUrl, outputUrl, base }) {
	const rendered = renderErrorTemplate(readFileSync(sourceUrl, "utf8"), base);
	const outputPath = fileURLToPath(outputUrl);
	mkdirSync(dirname(outputPath), { recursive: true });

	let current;
	try {
		current = readFileSync(outputUrl, "utf8");
	} catch (error) {
		if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
	}

	if (current !== rendered) writeFileSync(outputUrl, rendered, "utf8");
	return outputPath;
}
