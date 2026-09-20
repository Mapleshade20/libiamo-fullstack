import { redirect } from "@sveltejs/kit";
import { base } from "$app/paths";
import { STREAK_DEPENDENCY, TRIAL_QUOTA_DEPENDENCY } from "$lib/load-dependencies";
import { requireUser } from "$lib/server/auth/authz";
import { gravatarAvatarUrl } from "$lib/server/gravatar";
import { devStreakDayOffset, getStreakRecord } from "$lib/server/streak";
import { getTrialQuotaBalance, hasUserApiKey } from "$lib/server/trial-quota";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async (event) => {
	if (!event.locals.user && event.url.pathname === `${base}/`) {
		throw redirect(302, `${base}/welcome`);
	}

	event.depends?.(TRIAL_QUOTA_DEPENDENCY);
	event.depends?.(STREAK_DEPENDENCY);
	const user = requireUser(event);

	const avatarUrl = gravatarAvatarUrl(user.email);
	const hasApiKey = await hasUserApiKey(user.id);
	const trialQuota = hasApiKey ? null : await getTrialQuotaBalance(user.id);
	// The record, not a rendered view: the client re-derives settlement at local midnight without a
	// round trip, and SSR stays synchronous.
	const streak = await getStreakRecord(user.id);

	return {
		user: {
			id: user.id,
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
		streak,
		// Zero in production; `/streak-lab` sets it so the navbar travels with the server.
		streakDayOffset: devStreakDayOffset(),
	};
};
