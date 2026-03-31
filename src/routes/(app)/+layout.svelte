<script lang="ts">
	import { enhance } from "$app/forms";
	import { page } from "$app/stores";
	import { Button } from "$lib/components/ui/button";

	let { data, children } = $props();

	const languageLabels: Record<string, string> = {
		en: "EN",
		es: "ES",
		fr: "FR",
	};

	const languages = ["en", "es", "fr"] as const;
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
				<form
					method="POST"
					action="/?/switchLanguage"
					use:enhance
					class="flex gap-1"
				>
					{#each languages as lang}
						<button
							type="submit"
							name="language"
							value={lang}
							class="rounded-md px-2 py-1 text-xs font-medium transition-colors {data
								.user.activeLanguage === lang
								? 'bg-primary text-primary-foreground'
								: 'text-muted-foreground hover:bg-secondary'}"
						>
							{languageLabels[lang]}
						</button>
					{/each}
				</form>

				<a
					href="/profile"
					class="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
				>
					<img
						src={data.avatarUrl}
						alt={data.user.nickname || data.user.name}
						class="h-7 w-7 rounded-full border border-border object-cover shadow-sm"
					/>
					<span class="hidden sm:inline">
						{data.user.nickname || data.user.name}
					</span>
				</a>

				{#if data.user.role === "admin"}
					<a
						href="/admin/templates"
						class="text-sm text-muted-foreground hover:text-foreground"
					>
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
