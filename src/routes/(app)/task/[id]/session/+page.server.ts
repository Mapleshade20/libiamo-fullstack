import crypto from "node:crypto";
import { redirect } from "@sveltejs/kit"; // Removed the unused 'error' import
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	if (!user) return redirect(302, "/sign-in");

	const taskId = event.params.id;

	// Use the exact same domain and parameters as +layout.server.ts to sync avatars
	const email = user.email?.toLowerCase() || "";
	const hash = crypto.createHash("md5").update(email).digest("hex");
	const avatarUrl = `https://cn.cravatar.com/avatar/${hash}?d=identicon&s=192`;

	// Retrieve active language
	const learningLanguage = user.activeLanguage || "en";

	return {
		taskId,
		user: {
			name: user.name || "Learner",
			avatarUrl,
			learningLanguage,
		},
	};
};
