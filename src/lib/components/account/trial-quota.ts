import { invalidate } from "$app/navigation";
import { page } from "$app/state";
import { TRIAL_QUOTA_DEPENDENCY } from "$lib/app/load-dependencies";

/**
 * Re-reads the trial balance after an action that spent it. The app layout no longer reloads on
 * navigation, so every LLM-backed action calls this once it returns. Learners on their own key have
 * no balance to show, and their calls reload nothing.
 */
export function refreshTrialQuota(): Promise<void> {
	if (!page.data.trialQuota) return Promise.resolve();
	return invalidate(TRIAL_QUOTA_DEPENDENCY);
}
