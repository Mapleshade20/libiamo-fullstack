import crypto from "node:crypto";
import { requireUser } from "$lib/server/auth/authz";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async (event) => {
	const user = requireUser(event);

	const email = user.email?.toLowerCase() || "";
	const hash = crypto.createHash("md5").update(email).digest("hex");
	const avatarUrl = `https://gravatar.com/avatar/${hash}?d=identicon&s=192`;

	return {
		user: {
			name: user.name,
			email: user.email,
			role: user.role,
			activeLanguage: user.activeLanguage,
			timezone: user.timezone,
			nativeLanguage: user.nativeLanguage,
		},
		avatarUrl,
	};
};
