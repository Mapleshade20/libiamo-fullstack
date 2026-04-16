<script lang="ts">
	import { enhance } from "$app/forms";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Eye, EyeOff } from "@lucide/svelte";

	let { form, data } = $props();
	let showPassword = $state(false);
</script>

<Card.Root>
	<Card.Header><Card.Title class="text-xl">Sign In</Card.Title></Card.Header>
	<Card.Content>
		{#if data.resetSuccess}
			<p class="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700">
				Password reset successfully. Please sign in.
			</p>
		{/if}

		{#if form?.message}
			<p class="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
				{form.message}
			</p>
		{/if}

		<form method="POST" use:enhance class="space-y-4">
			<div class="space-y-2">
				<Label for="email">Email</Label>
				<Input
					id="email"
					name="email"
					type="email"
					value={form?.values?.email ?? ""}
					required
				/>
				{#if form?.errors?.email}
					<p class="text-sm text-red-600">{form.errors.email[0]}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="password">Password</Label>
				<div class="relative">
					<Input
						id="password"
						name="password"
						type={showPassword ? "text" : "password"}
						required
					/>
					<button
						type="button"
						class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
						onclick={() => (showPassword = !showPassword)}
					>
						{#if showPassword}
							<EyeOff size={18} />
						{:else}
							<Eye size={18} />
						{/if}
					</button>
				</div>
				{#if form?.errors?.password}
					<p class="text-sm text-red-600">
						{form.errors.password[0]}
					</p>
				{/if}
			</div>

			<Button type="submit" class="w-full">Sign In</Button>
		</form>
	</Card.Content>
	<Card.Footer class="flex flex-col gap-2 text-sm">
		<a href="/forgot-password" class="text-muted-foreground hover:underline"
			>Forgot password?</a
		>
		<p class="text-muted-foreground">
			Don't have an account? <a
				href="/sign-up"
				class="font-medium text-foreground hover:underline">Sign Up</a
			>
		</p>
	</Card.Footer>
</Card.Root>
