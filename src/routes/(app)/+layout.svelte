<script lang="ts">
	import { enhance } from "$app/forms";

	let { children, data } = $props();

	const languageLabelsShort: Record<string, string> = {
		en: "EN",
		es: "ES",
		fr: "FR",
		ja: "JA",
	};
	const languageLabelsFull: Record<string, string> = {
		en: "English",
		es: "Español",
		fr: "Français",
		ja: "日本語",
	};

	const languages = ["en", "es", "fr", "ja"] as const;
	const flagBaseUrl = "https://flagcdn.com/32x24/";

	const countryCodeMap: Record<string, string> = {
		en: "gb",
		ja: "jp",
	};

	function getFlagCode(lang: string): string {
		return countryCodeMap[lang] ?? lang;
	}

	let isOpen = $state(false);
	let triggerButton: HTMLButtonElement | undefined = $state();

	function clickOutside(
		node: HTMLElement,
		exclude: (HTMLElement | undefined)[],
	) {
		const handleClick = (event: MouseEvent) => {
			const target = event.target as Node;
			if (node.contains(target)) return;
			for (const el of exclude) {
				if (el?.contains(target)) return;
			}
			isOpen = false;
		};
		document.addEventListener("click", handleClick);
		return {
			destroy() {
				document.removeEventListener("click", handleClick);
			},
		};
	}

	function toggleMenu() {
		isOpen = !isOpen;
	}
</script>

<div class="min-h-screen">
	<nav class="border-b border-border bg-background/80 backdrop-blur-sm">
		<div
			class="mx-auto flex max-w-5xl items-center justify-between px-4 py-3"
		>
			<a
				href="/"
				class="text-xl font-bold"
				style="font-family: var(--font-heading)">Libiamo</a
			>

			<div class="flex items-center gap-4">
				<div class="relative">
					<button
						type="button"
						bind:this={triggerButton}
						onclick={toggleMenu}
						class="flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium transition-colors hover:bg-secondary"
						aria-expanded={isOpen}
					>
						<img
							src={`${flagBaseUrl}${getFlagCode(data.user.activeLanguage)}.png`}
							alt={data.user.activeLanguage}
							class="h-5 w-5 rounded-full object-cover"
						/>
						<span
							>{languageLabelsShort[
								data.user.activeLanguage
							]}</span
						>
					</button>

					{#if isOpen}
						<div
							class="absolute right-0 mt-2 w-32 overflow-hidden rounded-md border border-border bg-background shadow-lg z-50"
							use:clickOutside={[triggerButton]}
						>
							<form
								method="POST"
								action="/?/switchLanguage"
								use:enhance={() => {
									return async ({ result, update }) => {
										isOpen = false;
										await update();
									};
								}}
							>
								<div class="py-1">
									{#each languages as lang}
										<button
											type="submit"
											name="language"
											value={lang}
											class="flex w-full items-center gap-3 px-3 py-2 text-sm hover:bg-secondary transition-colors {data
												.user.activeLanguage === lang
												? 'bg-primary/10 text-primary font-semibold'
												: 'text-foreground'}"
										>
											<img
												src={`${flagBaseUrl}${getFlagCode(lang)}.png`}
												alt={lang}
												class="h-4 w-4 rounded-sm object-cover"
											/>
											<span
												>{languageLabelsFull[
													lang
												]}</span
											>
										</button>
									{/each}
								</div>
							</form>
						</div>
					{/if}
				</div>

				<a
					href="/profile"
					class="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
				>
					<img
						src={data.avatarUrl}
						alt={data.user.name}
						class="h-7 w-7 rounded-full border border-border object-cover shadow-sm"
					/>
					<span class="hidden sm:inline">
						{data.user.name}
					</span>
				</a>

				{#if data.user.role === 'admin'}
					<a href="/admin/templates" class="text-sm text-muted-foreground hover:text-foreground">
						Admin
					</a>
				{/if}
			</div>
		</div>
	</nav>

	<main class="mx-auto max-w-5xl px-4 py-8">
		{@render children()}
	</main>
</div>
