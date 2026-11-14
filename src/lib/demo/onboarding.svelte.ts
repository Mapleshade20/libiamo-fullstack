/* The first visit: setting up (the /welcome page), then the tour (lib/components/tour), which walks through the app by
   doing it on stand-in data. The main app shows it once after sign-up; the demo shows it when this browser has neither
   settings nor a finished welcome, and the developer settings can replay it. */
export const onboarding = $state({ tour: false });
// "0": a new account that has not set up yet (it has to before anything else).
export const needsWelcome = () => localStorage.getItem("onboarded") === "0" || (!localStorage.getItem("onboarded") && !localStorage.getItem("prefs"));
/** The welcome's last step: the tour of the home page if they asked for it, else never. */
export function finishWelcome(tour: boolean) {
	localStorage.setItem("onboarded", "1");
	if (!tour) localStorage.setItem("tourDone", "1");
	onboarding.tour = tour;
}
/** A new account: the welcome comes first, whatever this browser kept. */
export function newAccount() {
	localStorage.setItem("onboarded", "0");
}
export function replayWelcome() {
	localStorage.removeItem("onboarded");
}
