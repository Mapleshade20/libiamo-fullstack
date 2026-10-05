<script lang="ts">
import { enhance } from "$app/forms";
import { handleInvalidField } from "$lib/client/form-attention";
import ActionNotification from "$lib/components/common/ActionNotification.svelte";
import ConfirmDialog from "$lib/components/common/ConfirmDialog.svelte";
import Field from "$lib/components/common/Field.svelte";
import FormErrorFocus from "$lib/components/common/FormErrorFocus.svelte";
import MarkdownRenderer from "$lib/components/common/MarkdownRenderer.svelte";
import { Badge } from "$lib/components/ui/badge";
import { Button } from "$lib/components/ui/button";
import * as Card from "$lib/components/ui/card";
import { Input } from "$lib/components/ui/input";
import { Textarea } from "$lib/components/ui/textarea";
import { getDisplayClock } from "$lib/time/display-clock";

let { form, data } = $props();

const displayClock = getDisplayClock();
let publishForm: HTMLFormElement | null = $state(null);
let deleteForm: HTMLFormElement | null = $state(null);
let pendingDelete = $state<{ id: number; title: string } | null>(null);
let confirmOpen = $state(false);

const actionNotification = $derived(
	form?.action === "publish" && form.success
		? { variant: "success" as const, title: "Announcement published", message: "Learners will find it in their Hall inbox." }
		: form?.action === "delete" && form.success
			? { variant: "success" as const, title: "Announcement deleted", message: "Learners no longer see it." }
			: form && "message" in form && form.message
				? { variant: "error" as const, title: "Unable to delete announcement", message: form.message }
				: null,
);
const errors = $derived(
	form?.action === "publish" && "errors" in form ? (form.errors as Partial<Record<"title" | "body" | "expiresAt", string[]>>) : undefined,
);
const values = $derived(form?.action === "publish" && "values" in form ? form.values : undefined);

function formatTime(date: Date): string {
	return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: displayClock().timeZone }).format(date);
}

function requestDelete(announcement: { id: number; title: string }) {
	pendingDelete = announcement;
	confirmOpen = true;
}
</script>

<svelte:head>
	<title>Announcements · Admin · Libiamo</title>
	<meta name="description" content="Publish and withdraw announcements shown in every learner's Hall.">
</svelte:head>

<div class="space-y-8">
	<ActionNotification notification={actionNotification} />

	<h1>Announcements</h1>

	<Card.Root>
		<Card.Header> <Card.Title>Publish an announcement</Card.Title> </Card.Header>
		<Card.Content>
			<FormErrorFocus formRef={publishForm} {errors} fieldOrder={["title", "body", "expiresAt"]} />
			<form
				bind:this={publishForm}
				method="POST"
				action="?/publish"
				use:enhance={() => async ({ update }) => update({ reset: true })}
				class="space-y-4"
				oninvalidcapture={handleInvalidField}
			>
				<Field label="Title" for="title" required error={errors?.title?.[0]}>
					<Input id="title" name="title" required maxlength={200} value={values?.title ?? ""} aria-invalid={Boolean(errors?.title)} />
				</Field>
				<Field label="Message" for="body" required description="Markdown is supported." error={errors?.body?.[0]}>
					<Textarea id="body" name="body" required rows={6} value={values?.body ?? ""} aria-invalid={Boolean(errors?.body)} />
				</Field>
				<Field
					label="Expires"
					for="expiresAt"
					description={`Leave empty to keep it up until you delete it. Times are in ${data.timeZone}.`}
					error={errors?.expiresAt?.[0]}
				>
					<Input
						id="expiresAt"
						name="expiresAt"
						type="datetime-local"
						lang="en"
						class="w-60"
						value={values?.expiresAt ?? ""}
						aria-invalid={Boolean(errors?.expiresAt)}
					/>
				</Field>
				<Button type="submit">Publish</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<section class="space-y-3">
		<h2>Published</h2>
		{#if data.announcements.length > 0}
			<Card.Root class="divide-y p-0">
				{#each data.announcements as announcement (announcement.id)}
					{@const expired = announcement.expiresAt !== null && announcement.expiresAt.getTime() <= displayClock().now}
					<article class="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
						<div class="min-w-0 space-y-1.5">
							<div class="flex flex-wrap items-center gap-2">
								<h3 class="text-sm font-medium">{announcement.title}</h3>
								<Badge variant={expired ? "outline" : "success"}>{expired ? "Expired" : "Live"}</Badge>
							</div>
							<p class="text-xs text-muted-foreground">
								Published {formatTime(announcement.createdAt)} ·
								{announcement.expiresAt ? `${expired ? "Expired" : "Expires"} ${formatTime(announcement.expiresAt)}` : "No expiry"}
								· Read by
								{announcement.readCount}
							</p>
							<div class="line-clamp-3 text-sm text-muted-foreground"><MarkdownRenderer content={announcement.body} /></div>
						</div>
						<Button variant="destructive" size="sm" onclick={() => requestDelete(announcement)}>Delete</Button>
					</article>
				{/each}
			</Card.Root>
		{:else}
			<p class="text-sm text-muted-foreground">No announcements yet.</p>
		{/if}
	</section>
</div>

<form bind:this={deleteForm} method="POST" action="?/delete" use:enhance hidden><input type="hidden" name="id" value={pendingDelete?.id ?? ""}></form>

<ConfirmDialog
	bind:open={confirmOpen}
	title="Delete this announcement?"
	message={pendingDelete ? `“${pendingDelete.title}” disappears from every learner's Hall, including the collection of read announcements.` : undefined}
	confirmLabel="Delete"
	cancelLabel="Cancel"
	onconfirm={() => {
		confirmOpen = false;
		deleteForm?.requestSubmit();
	}}
/>
