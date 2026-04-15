<script lang="ts">
import { getDefaultOpeningState, type OpeningState, transformOpeningState, type UiVariant } from "$lib/admin/variant-helpers";
import { Button } from "$lib/components/ui/button";
import { Input } from "$lib/components/ui/input";
import { Label } from "$lib/components/ui/label";
import { Textarea } from "$lib/components/ui/textarea";

interface Props {
	/** Current opening state (bindable) */
	value: Record<string, unknown>;
	/** Selected UI variant */
	ui: UiVariant;
	/** Hidden input name for form serialisation */
	name?: string;
	/** Called when value changes */
	onchange?: (value: OpeningState) => void;
}

let { value = $bindable({}), ui, name, onchange }: Props = $props();

// Track previous UI to detect changes
let previousUi = $state<UiVariant | null>(null);

// Transform state when UI changes
$effect(() => {
	if (previousUi === null) {
		previousUi = ui;
		return;
	}
	if (ui !== previousUi) {
		const transformed = transformOpeningState(value, previousUi, ui);
		value = transformed as Record<string, unknown>;
		previousUi = ui;
		onchange?.(transformed);
	}
});

// Notify parent on any change
function notifyChange() {
	onchange?.(value as OpeningState);
}

// Serialized value for hidden input
const serialized = $derived(JSON.stringify(value));

// ── iMessage / Discord message helpers ───────────────────────────
type Message = { sender: "user" | "agent"; text: string; timestamp?: string };

function getMessages(): Message[] {
	const msgs = value.previousMessages;
	if (!Array.isArray(msgs)) return [];
	return msgs as Message[];
}

function setMessages(msgs: Message[]) {
	value = { ...value, previousMessages: msgs };
	notifyChange();
}

function addMessage() {
	setMessages([...getMessages(), { sender: "user", text: "" }]);
}

function removeMessage(i: number) {
	setMessages(getMessages().filter((_, idx) => idx !== i));
}

function updateMessage(i: number, field: keyof Message, val: string) {
	const msgs = getMessages();
	msgs[i] = { ...msgs[i], [field]: val };
	setMessages(msgs);
}

// ── Apple Mail email helpers ─────────────────────────────────────
type Email = { from: string; to: string; subject: string; body: string; date?: string };

function getEmails(): Email[] {
	const emails = value.emails;
	if (!Array.isArray(emails)) return [];
	return emails as Email[];
}

function setEmails(emails: Email[]) {
	value = { ...value, emails };
	notifyChange();
}

function addEmail() {
	setEmails([...getEmails(), { from: "", to: "", subject: "", body: "" }]);
}

function removeEmail(i: number) {
	setEmails(getEmails().filter((_, idx) => idx !== i));
}

function updateEmail(i: number, field: keyof Email, val: string) {
	const emails = getEmails();
	emails[i] = { ...emails[i], [field]: val };
	setEmails(emails);
}

// ── Reddit comment helpers ───────────────────────────────────────
type Comment = { author: string; text: string; votes?: number };

function getComments(): Comment[] {
	const comments = value.previousComments;
	if (!Array.isArray(comments)) return [];
	return comments as Comment[];
}

function setComments(comments: Comment[]) {
	value = { ...value, previousComments: comments.length > 0 ? comments : undefined };
	notifyChange();
}

function addComment() {
	setComments([...getComments(), { author: "", text: "" }]);
}

function removeComment(i: number) {
	setComments(getComments().filter((_, idx) => idx !== i));
}

function updateComment(i: number, field: keyof Comment, val: string | number | undefined) {
	const comments = getComments();
	comments[i] = { ...comments[i], [field]: val };
	setComments(comments);
}

// ── AO3 tags helper ──────────────────────────────────────────────
function getTags(): string[] {
	const tags = value.tags;
	if (!Array.isArray(tags)) return [];
	return tags as string[];
}

function setTags(tags: string[]) {
	value = { ...value, tags: tags.length > 0 ? tags : undefined };
	notifyChange();
}

// ── Generic field update ─────────────────────────────────────────
function updateField(field: string, val: unknown) {
	value = { ...value, [field]: val };
	notifyChange();
}

function updateNestedField(parent: string, field: string, val: unknown) {
	const parentObj = (value[parent] as Record<string, unknown>) ?? {};
	value = { ...value, [parent]: { ...parentObj, [field]: val } };
	notifyChange();
}

// ── Reset to defaults ────────────────────────────────────────────
function resetToDefaults() {
	value = getDefaultOpeningState(ui) as Record<string, unknown>;
	notifyChange();
}
</script>

<div class="space-y-4">
	{#if name}
		<input type="hidden" {name} value={serialized}>
	{/if}

	<!-- iMessage UI -->
	{#if ui === "imessage"}
		<fieldset class="space-y-3">
			<legend class="text-sm font-medium">Previous Messages</legend>
			{#each getMessages() as msg, i (i)}
				<div class="flex gap-2 rounded border border-input p-2">
					<select
						class="h-9 rounded-md border border-input bg-background px-2 text-sm"
						value={msg.sender}
						onchange={(e) => updateMessage(i, "sender", e.currentTarget.value)}
					>
						<option value="user">User</option>
						<option value="agent">Agent</option>
					</select>
					<Input class="flex-1" value={msg.text} placeholder="Message text" oninput={(e) => updateMessage(i, "text", e.currentTarget.value)} />
					<Button type="button" variant="ghost" size="sm" onclick={() => removeMessage(i)}>×</Button>
				</div>
			{/each}
			<Button type="button" variant="outline" size="sm" onclick={addMessage}>+ Add Message</Button>
		</fieldset>
	{/if}

	<!-- Discord UI -->
	{#if ui === "discord"}
		<div class="grid gap-3 sm:grid-cols-2">
			<div class="space-y-1">
				<Label>Server Name</Label>
				<Input value={String(value.serverName ?? "")} oninput={(e) => updateField("serverName", e.currentTarget.value)} placeholder="My Server" />
			</div>
			<div class="space-y-1">
				<Label>Channel Name</Label>
				<Input value={String(value.channelName ?? "")} oninput={(e) => updateField("channelName", e.currentTarget.value)} placeholder="general" />
			</div>
		</div>
		<fieldset class="space-y-3">
			<legend class="text-sm font-medium">Previous Messages</legend>
			{#each getMessages() as msg, i (i)}
				<div class="flex gap-2 rounded border border-input p-2">
					<select
						class="h-9 rounded-md border border-input bg-background px-2 text-sm"
						value={msg.sender}
						onchange={(e) => updateMessage(i, "sender", e.currentTarget.value)}
					>
						<option value="user">User</option>
						<option value="agent">Agent</option>
					</select>
					<Input class="flex-1" value={msg.text} placeholder="Message text" oninput={(e) => updateMessage(i, "text", e.currentTarget.value)} />
					<Input
						class="w-32"
						value={msg.timestamp ?? ""}
						placeholder="Timestamp"
						oninput={(e) => updateMessage(i, "timestamp", e.currentTarget.value)}
					/>
					<Button type="button" variant="ghost" size="sm" onclick={() => removeMessage(i)}>×</Button>
				</div>
			{/each}
			<Button type="button" variant="outline" size="sm" onclick={addMessage}>+ Add Message</Button>
		</fieldset>
	{/if}

	<!-- Reddit UI -->
	{#if ui === "reddit"}
		<fieldset class="space-y-3 rounded border border-input p-3">
			<legend class="text-sm font-medium px-1">Post</legend>
			<div class="grid gap-3 sm:grid-cols-2">
				<div class="space-y-1">
					<Label>Title</Label>
					<Input
						value={String((value.post as Record<string, unknown>)?.title ?? "")}
						oninput={(e) => updateNestedField("post", "title", e.currentTarget.value)}
					/>
				</div>
				<div class="space-y-1">
					<Label>Subreddit</Label>
					<Input
						value={String((value.post as Record<string, unknown>)?.subreddit ?? "")}
						oninput={(e) => updateNestedField("post", "subreddit", e.currentTarget.value)}
						placeholder="AskReddit"
					/>
				</div>
				<div class="space-y-1">
					<Label>Author</Label>
					<Input
						value={String((value.post as Record<string, unknown>)?.author ?? "")}
						oninput={(e) => updateNestedField("post", "author", e.currentTarget.value)}
					/>
				</div>
				<div class="space-y-1">
					<Label>Votes</Label>
					<Input
						type="number"
						value={(value.post as Record<string, unknown>)?.votes ?? ""}
						oninput={(e) =>
							updateNestedField("post", "votes", e.currentTarget.value ? Number(e.currentTarget.value) : undefined)}
					/>
				</div>
			</div>
			<div class="space-y-1">
				<Label>Body</Label>
				<Textarea
					rows={3}
					value={String((value.post as Record<string, unknown>)?.body ?? "")}
					oninput={(e) => updateNestedField("post", "body", e.currentTarget.value)}
				/>
			</div>
		</fieldset>
		<fieldset class="space-y-3">
			<legend class="text-sm font-medium">Previous Comments</legend>
			{#each getComments() as comment, i (i)}
				<div class="flex gap-2 rounded border border-input p-2">
					<Input class="w-32" value={comment.author} placeholder="Author" oninput={(e) => updateComment(i, "author", e.currentTarget.value)} />
					<Input class="flex-1" value={comment.text} placeholder="Comment text" oninput={(e) => updateComment(i, "text", e.currentTarget.value)} />
					<Input
						class="w-20"
						type="number"
						value={comment.votes ?? ""}
						placeholder="Votes"
						oninput={(e) => updateComment(i, "votes", e.currentTarget.value ? Number(e.currentTarget.value) : undefined)}
					/>
					<Button type="button" variant="ghost" size="sm" onclick={() => removeComment(i)}>×</Button>
				</div>
			{/each}
			<Button type="button" variant="outline" size="sm" onclick={addComment}>+ Add Comment</Button>
		</fieldset>
	{/if}

	<!-- Apple Mail UI -->
	{#if ui === "apple_mail"}
		<fieldset class="space-y-3">
			<legend class="text-sm font-medium">Emails</legend>
			{#each getEmails() as email, i (i)}
				<div class="space-y-2 rounded border border-input p-3">
					<div class="flex justify-between">
						<span class="text-xs text-muted-foreground">Email {i + 1}</span>
						<Button type="button" variant="ghost" size="sm" onclick={() => removeEmail(i)}>×</Button>
					</div>
					<div class="grid gap-2 sm:grid-cols-2">
						<div class="space-y-1">
							<Label class="text-xs">From</Label>
							<Input value={email.from} oninput={(e) => updateEmail(i, "from", e.currentTarget.value)} placeholder="sender@example.com" />
						</div>
						<div class="space-y-1">
							<Label class="text-xs">To</Label>
							<Input value={email.to} oninput={(e) => updateEmail(i, "to", e.currentTarget.value)} placeholder="recipient@example.com" />
						</div>
						<div class="space-y-1">
							<Label class="text-xs">Subject</Label>
							<Input value={email.subject} oninput={(e) => updateEmail(i, "subject", e.currentTarget.value)} />
						</div>
						<div class="space-y-1">
							<Label class="text-xs">Date</Label>
							<Input value={email.date ?? ""} oninput={(e) => updateEmail(i, "date", e.currentTarget.value)} placeholder="2024-01-15" />
						</div>
					</div>
					<div class="space-y-1">
						<Label class="text-xs">Body</Label>
						<Textarea rows={2} value={email.body} oninput={(e) => updateEmail(i, "body", e.currentTarget.value)} />
					</div>
				</div>
			{/each}
			<Button type="button" variant="outline" size="sm" onclick={addEmail}>+ Add Email</Button>
		</fieldset>
	{/if}

	<!-- AO3 UI -->
	{#if ui === "ao3"}
		<div class="space-y-3">
			<div class="space-y-1">
				<Label>Work Title</Label>
				<Input value={String(value.workTitle ?? "")} oninput={(e) => updateField("workTitle", e.currentTarget.value)} required />
			</div>
			<div class="space-y-1">
				<Label>Chapter Title (optional)</Label>
				<Input value={String(value.chapterTitle ?? "")} oninput={(e) => updateField("chapterTitle", e.currentTarget.value || undefined)} />
			</div>
			<div class="space-y-1">
				<Label>Body Excerpt (optional)</Label>
				<Textarea rows={3} value={String(value.bodyExcerpt ?? "")} oninput={(e) => updateField("bodyExcerpt", e.currentTarget.value || undefined)} />
			</div>
			<div class="space-y-1">
				<Label>Tags (comma-separated)</Label>
				<Input
					value={getTags().join(", ")}
					oninput={(e) => {
						const tags = e.currentTarget.value
							.split(",")
							.map((t) => t.trim())
							.filter(Boolean);
						setTags(tags);
					}}
					placeholder="Angst, Fluff, Slow Burn"
				/>
			</div>
		</div>
	{/if}

	<!-- Translator UI -->
	{#if ui === "translator"}
		<div class="space-y-1">
			<Label>Source Text</Label>
			<Textarea
				rows={4}
				value={String(value.sourceText ?? "")}
				oninput={(e) => updateField("sourceText", e.currentTarget.value)}
				placeholder="Text to translate..."
				required
			/>
		</div>
	{/if}

	<div class="pt-2"><Button type="button" variant="ghost" size="sm" onclick={resetToDefaults}> Reset to Defaults </Button></div>
</div>
