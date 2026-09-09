import crypto from "node:crypto";
import { TRIAL_QUOTA_DEPENDENCY } from "$lib/load-dependencies";
import { requireUser } from "$lib/server/auth/authz";
import { getBrowserTimezone } from "$lib/server/browser-timezone";
import { getLocalDateString } from "$lib/server/scheduling/dates";
import { getTrialQuotaBalance, hasUserApiKey } from "$lib/server/trial-quota";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async (event) => {
	event.depends?.(TRIAL_QUOTA_DEPENDENCY);
	const user = requireUser(event);

	const email = user.email?.toLowerCase() || "";
	const hash = crypto.createHash("md5").update(email).digest("hex");
	const accountScope = crypto.createHash("sha256").update(user.id).digest("base64url");
	const avatarUrl = `https://gravatar.com/avatar/${hash}?d=identicon&s=192`;
	const hasApiKey = await hasUserApiKey(user.id);
	const trialQuota = hasApiKey ? null : await getTrialQuotaBalance(user.id);
	const questHallEdition = getLocalDateString(getBrowserTimezone(event.cookies));

	return {
		accountScope,
		questHallEdition,
		user: {
			name: user.name,
			email: user.email,
			role: user.role,
			activeLanguage: user.activeLanguage,
			nativeLanguage: user.nativeLanguage,
			feedbackLanguagePreference: user.feedbackLanguagePreference,
		},
		avatarUrl,
		hasApiKey,
		trialQuota,
	};
};
