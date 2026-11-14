// The demo keeps everything on the device (lib/demo), so it renders in the browser only.
export const ssr = false;

export async function load() {
	const { ready, applyLang } = await import("#lib/demo/app.svelte.ts");
	await ready();
	applyLang();
	return {};
}
