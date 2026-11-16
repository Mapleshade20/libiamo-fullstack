import { finishWelcome as finishAccount } from "./account.svelte.ts";

/* The first visit: setting up (the /welcome page), then the tour (lib/components/tour), which walks through the app by
   doing it on stand-in data: after the welcome if the learner asks for it, and from the account menu whenever they
   like. Only the browser asks for it. */
export const onboarding = $state({ tour: false });
/** The welcome's last step: the account is set up, and the tour of the home page follows if they asked for it. */
export async function finishWelcome(tour: boolean) {
	await finishAccount();
	onboarding.tour = tour;
}
