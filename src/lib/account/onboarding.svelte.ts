import { account, finishWelcome as finishAccount } from "./account.svelte.ts";

/* The first visit: setting up (the /welcome page), then the tour (lib/components/tour), which walks through the app by
   doing it on stand-in data, once after the welcome if the learner asks for it. */
export const onboarding = $state({ tour: false });
/** A new account sets up before anything else. */
export const needsWelcome = () => account.signedIn && !account.me.onboarded;
/** The welcome's last step: the account is set up, and the tour of the home page follows if they asked for it. */
export async function finishWelcome(tour: boolean) {
	await finishAccount();
	if (!tour) localStorage.setItem("tourDone", "1");
	onboarding.tour = tour;
}
