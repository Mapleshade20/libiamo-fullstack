import crypto from "node:crypto";
import { TRIAL_QUOTA_DEPENDENCY } from "$lib/load-dependencies";
import { requireUser } from "$lib/server/auth/authz";
import { getTrialQuotaBalance, hasUserApiKey } from "$lib/server/trial-quota";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async (event) => {
	event.depends?.(TRIAL_QUOTA_DEPENDENCY);
	const user = requireUser(event);

	const email = user.email?.toLowerCase() || "";
	const hash = crypto.createHash("md5").update(email).digest("hex");
	const avatarUrl = `https://gravatar.com/avatar/${hash}?d=identicon&s=192`;
	const hasApiKey = await hasUserApiKey(user.id);
	const trialQuota = hasApiKey ? null : await getTrialQuotaBalance(user.id);

	return {
		user: {
			name: user.name,
			email: user.email,
			role: user.role,
			activeLanguage: user.activeLanguage,
			timezone: user.timezone,
			nativeLanguage: user.nativeLanguage,
			feedbackLanguagePreference: user.feedbackLanguagePreference,
		},
		avatarUrl,
		hasApiKey,
		trialQuota,
	};
};
