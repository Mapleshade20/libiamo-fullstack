import type { PageLoad } from "./$types";

export const load: PageLoad = async () => {
	let serverTimezones: { value: string; label: string }[] = [];

	try {
		const raw = Intl.supportedValuesOf("timeZone");
		serverTimezones = raw.map((tz) => {
			try {
				const offsetParts = new Intl.DateTimeFormat("en-US", {
					timeZone: tz,
					timeZoneName: "shortOffset",
				}).formatToParts(new Date());
				const utcOffset = offsetParts.find((p) => p.type === "timeZoneName")?.value.replace("GMT", "UTC") || "";

				const localizedName =
					new Intl.DateTimeFormat("en-US", {
						timeZone: tz,
						timeZoneName: "long",
					})
						.formatToParts(new Date())
						.find((p) => p.type === "timeZoneName")?.value || tz;

				return {
					value: tz,
					label: `${tz} (${localizedName}, ${utcOffset})`,
				};
			} catch {
				return { value: tz, label: tz };
			}
		});
	} catch {
		// Server runtime doesn't support supportedValuesOf — leave empty
	}

	return {
		serverTimezones,
	};
};
