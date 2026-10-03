/**
 * On/off environment variables. Examples write `1`/`0`; `true`/`false`, `yes`/`no` and `on`/`off`
 * are accepted too, case-insensitively. Empty or unrecognised values fall back to the default.
 */
export function envFlag(value: string | undefined, fallback: boolean): boolean {
	const normalized = value?.trim().toLowerCase();
	if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
	if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
	return fallback;
}
