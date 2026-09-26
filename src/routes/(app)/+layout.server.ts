import { redirect } from "@sveltejs/kit";
import { base } from "$app/paths";
import { STREAK_DEPENDENCY, TRIAL_QUOTA_DEPENDENCY } from "$lib/app/load-dependencies";
import { gravatarAvatarUrl } from "$lib/server/account/gravatar";
import { getTrialQuotaBalance, hasUserApiKey } from "$lib/server/account/trial-quota";
import { requireUser } from "$lib/server/auth/authz";
import { db } from "$lib/server/db";
import { devStreakDayOffset, getStreakRecord, isReviewQueueEmpty } from "$lib/server/streak";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async (event) => {
	// Untracked: reading the pathname would otherwise re-run this load, and every query below, on
	// each navigation. The data refreshes through the dependencies declared here instead.
	if (!event.locals.user && event.untrack(() => event.url.pathname === `${base}/`)) {
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
	const [streak, streakQueueEmpty] = await Promise.all([getStreakRecord(user.id), isReviewQueueEmpty(db, user.id, new Date())]);

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
		streakQueueEmpty,
		// Zero in production; `/streak-lab` sets it so the navbar travels with the server.
		streakDayOffset: devStreakDayOffset(),
	};
};
