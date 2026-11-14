// The pages still keep most of their data on the device (lib/demo), so they render in the browser only.
export const ssr = false;

export async function load() {
	const { ready, applyLang } = await import("#lib/demo/app.svelte.ts");
	const { hydrate } = await import("#lib/account/account.svelte.ts");
	const { refreshWriting } = await import("#lib/writing/writing.svelte.ts");
	await hydrate();
	await refreshWriting();
	await ready();
	applyLang();
	return {};
}
