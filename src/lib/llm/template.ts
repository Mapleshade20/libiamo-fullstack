/**
 * Slot templates: editable prompt prose with `{{name}}` placeholders that code fills with
 * data-dependent blocks (language names, rendered task briefs, output shapes).
 */

const PLACEHOLDER = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;

export class TemplateError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TemplateError";
	}
}

/** Placeholder names a template uses, in first-use order. */
export function templateVariables(template: string): string[] {
	return [...new Set(Array.from(template.matchAll(PLACEHOLDER), (match) => match[1]))];
}

/** Placeholders a template uses that are not in `allowed`. */
export function unknownTemplateVariables(template: string, allowed: readonly string[]): string[] {
	const known = new Set(allowed);
	return templateVariables(template).filter((name) => !known.has(name));
}

export function fillTemplate(template: string, variables: Readonly<Record<string, string>>): string {
	return template.replace(PLACEHOLDER, (_match, name: string) => {
		const value = variables[name];
		if (value === undefined) throw new TemplateError(`Unknown template variable {{${name}}}.`);
		return value;
	});
}
