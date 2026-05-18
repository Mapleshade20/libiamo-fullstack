<script lang="ts">
import { getDefaultOpeningState, type OpeningState, type UiVariant } from "$lib/admin/variant-helpers";
import { Button } from "$lib/components/ui/button";
import { Input } from "$lib/components/ui/input";
import { Label } from "$lib/components/ui/label";
import { Textarea } from "$lib/components/ui/textarea";
import { type FieldDef, getEditorFields } from "$lib/schemas";

interface Props {
	value: Record<string, unknown>;
	ui: UiVariant;
	name?: string;
	onchange?: (value: OpeningState) => void;
}

let { value = $bindable({}), ui, name, onchange }: Props = $props();
let previousUi = $state<UiVariant | null>(null);

$effect(() => {
	if (previousUi === null) {
		previousUi = ui;
		return;
	}
	if (ui !== previousUi) {
		value = getDefaultOpeningState(ui) as Record<string, unknown>;
		previousUi = ui;
		onchange?.(value as OpeningState);
	}
});

const serialized = $derived(JSON.stringify(value));

function notify() {
	onchange?.(value as OpeningState);
}

function getFlatField(path: string): unknown {
	const parts = path.split(".");
	let current: unknown = value;
	for (const part of parts) {
		if (current && typeof current === "object" && part in current) {
			current = (current as Record<string, unknown>)[part];
		} else {
			return undefined;
		}
	}
	return current;
}

function setFlatField(path: string, val: unknown) {
	const parts = path.split(".");
	if (parts.length === 1) {
		value = { ...value, [parts[0]]: val };
	} else {
		const parentPath = parts.slice(0, -1);
		const lastKey = parts[parts.length - 1];
		let parent: Record<string, unknown> = { ...value };
		let current: Record<string, unknown> = parent;
		for (const part of parentPath) {
			const child = current[part];
			const newChild = child && typeof child === "object" ? { ...(child as Record<string, unknown>) } : {};
			current[part] = newChild;
			current = newChild;
		}
		current[lastKey] = val;
		value = parent;
	}
	notify();
}

function getList(key: string): Record<string, unknown>[] {
	const items = value[key];
	if (!Array.isArray(items)) return [];
	return items as Record<string, unknown>[];
}

function setList(key: string, items: Record<string, unknown>[]) {
	value = { ...value, [key]: items };
	notify();
}

function addListItem(key: string, defaultItem: Record<string, unknown>) {
	setList(key, [...getList(key), defaultItem]);
}

function removeListItem(key: string, index: number) {
	setList(
		key,
		getList(key).filter((_, i) => i !== index),
	);
}

function updateListItem(key: string, index: number, field: string, val: unknown) {
	const items = getList(key);
	items[index] = { ...items[index], [field]: val };
	setList(key, items);
}

function updateAo3CommentAt(
	items: Record<string, unknown>[],
	path: number[],
	updater: (item: Record<string, unknown>) => Record<string, unknown>,
): Record<string, unknown>[] {
	const [head, ...rest] = path;
	return items.map((item, index): Record<string, unknown> => {
		if (index !== head) return item;
		if (rest.length === 0) return updater(item);
		const replies = Array.isArray(item.replies) ? (item.replies as Record<string, unknown>[]) : [];
		return { ...item, replies: updateAo3CommentAt(replies, rest, updater) };
	});
}

function removeAo3CommentAt(items: Record<string, unknown>[], path: number[]): Record<string, unknown>[] {
	const [head, ...rest] = path;
	if (rest.length === 0) return items.filter((_, index) => index !== head);
	return items.map((item, index) => {
		if (index !== head) return item;
		const replies = Array.isArray(item.replies) ? (item.replies as Record<string, unknown>[]) : [];
		return { ...item, replies: removeAo3CommentAt(replies, rest) };
	});
}

function updateAo3CommentField(key: string, path: number[], field: string, val: unknown) {
	setList(
		key,
		updateAo3CommentAt(getList(key), path, (item) => ({ ...item, [field]: val })),
	);
}

function addAo3Reply(key: string, path: number[]) {
	const newReply = { username: "", comment: "", timestamp: "", replies: [] };
	setList(
		key,
		updateAo3CommentAt(getList(key), path, (item) => ({
			...item,
			replies: [...(Array.isArray(item.replies) ? (item.replies as Record<string, unknown>[]) : []), newReply],
		})),
	);
}

function removeAo3Comment(key: string, path: number[]) {
	setList(key, removeAo3CommentAt(getList(key), path));
}

function getAo3Replies(comment: Record<string, unknown>): Record<string, unknown>[] {
	return Array.isArray(comment.replies) ? (comment.replies as Record<string, unknown>[]) : [];
}

function resetToDefaults() {
	value = getDefaultOpeningState(ui) as Record<string, unknown>;
	notify();
}

const fields = $derived(getEditorFields(ui));
</script>

<div class="space-y-4">
	{#if name}
		<input type="hidden" {name} value={serialized}>
	{/if}

	{#each fields as field, idx (idx)}
		{#if field.type === "row"}
			<div class="grid gap-3 sm:grid-cols-2">
				{#each field.fields as sub}
					{@render renderField(sub, "")}
				{/each}
			</div>
		{:else}
			{@render renderField(field, "")}
		{/if}
	{/each}

	<div class="pt-2"><Button type="button" variant="ghost" size="sm" onclick={resetToDefaults}> Reset to Defaults </Button></div>
</div>

{#snippet renderField(field: FieldDef, parentPrefix: string)}
	{@const path = parentPrefix && "key" in field ? `${parentPrefix}.${field.key}` : "key" in field ? (field as { key: string }).key : ""}
	{#if field.type === "text"}
		<div class="space-y-1">
			<Label>{field.label}</Label>
			{#if ["tags", "fandoms", "relationships", "characters", "additionalTags", "categories"].includes(field.key)}
				<Input
					value={Array.isArray(getFlatField(path)) ? (getFlatField(path) as string[]).join(", ") : String(getFlatField(path) ?? "")}
					placeholder={field.placeholder}
					required={field.required}
					oninput={(e) => {
						const items = e.currentTarget.value.split(",").map((t) => t.trim()).filter(Boolean);
						setFlatField(path, items);
					}}
				/>
			{:else}
				<Input
					value={String(getFlatField(path) ?? "")}
					placeholder={field.placeholder}
					required={field.required}
					oninput={(e) => setFlatField(path, e.currentTarget.value || undefined)}
				/>
			{/if}
		</div>
	{:else if field.type === "textarea"}
		<div class="space-y-1">
			<Label>{field.label}</Label>
			<Textarea
				rows={field.rows ?? 3}
				value={String(getFlatField(path) ?? "")}
				placeholder={field.placeholder}
				required={field.required}
				oninput={(e) => setFlatField(path, e.currentTarget.value || undefined)}
			/>
		</div>
	{:else if field.type === "number"}
		<div class="space-y-1">
			<Label>{field.label}</Label>
			<Input
				type="number"
				value={getFlatField(path) ?? ""}
				placeholder={field.placeholder}
				oninput={(e) => setFlatField(path, e.currentTarget.value ? Number(e.currentTarget.value) : undefined)}
			/>
		</div>
	{:else if field.type === "message-list"}
		<fieldset class="space-y-3">
			<legend class="text-sm font-medium">{field.label}</legend>
			{#each getList(field.key) as msg, i (i)}
				<div class="flex gap-2 rounded border border-input p-2">
					<Input
						class="w-32"
						value={String(msg.sender ?? "")}
						placeholder="Sender"
						oninput={(e) => updateListItem(field.key, i, "sender", e.currentTarget.value)}
					/>
					<Input
						class="flex-1"
						value={String(msg.text ?? "")}
						placeholder="Message text"
						oninput={(e) => updateListItem(field.key, i, "text", e.currentTarget.value)}
					/>
					{#if field.withTimestamp}
						<Input
							class="w-32"
							value={String(msg.timestamp ?? "")}
							placeholder="Timestamp"
							oninput={(e) => updateListItem(field.key, i, "timestamp", e.currentTarget.value)}
						/>
					{/if}
					<Button type="button" variant="ghost" size="sm" onclick={() => removeListItem(field.key, i)}>×</Button>
				</div>
			{/each}
			<Button type="button" variant="outline" size="sm" onclick={() => addListItem(field.key, { sender: "", text: "" })}>+ Add Message</Button>
		</fieldset>
	{:else if field.type === "email-list"}
		<fieldset class="space-y-3">
			<legend class="text-sm font-medium">{field.label}</legend>
			{#each getList(field.key) as email, i (i)}
				<div class="space-y-2 rounded border border-input p-3">
					<div class="flex justify-between">
						<span class="text-xs text-muted-foreground">Email {i + 1}</span>
						<Button type="button" variant="ghost" size="sm" onclick={() => removeListItem(field.key, i)}>×</Button>
					</div>
					<div class="grid gap-2 sm:grid-cols-2">
						<div class="space-y-1">
							<Label class="text-xs">From</Label>
							<Input
								value={String(email.from ?? "")}
								oninput={(e) => updateListItem(field.key, i, "from", e.currentTarget.value)}
								placeholder="sender@example.com"
							/>
						</div>
						<div class="space-y-1">
							<Label class="text-xs">To</Label>
							<Input
								value={String(email.to ?? "")}
								oninput={(e) => updateListItem(field.key, i, "to", e.currentTarget.value)}
								placeholder="recipient@example.com"
							/>
						</div>
						<div class="space-y-1">
							<Label class="text-xs">Subject</Label>
							<Input value={String(email.subject ?? "")} oninput={(e) => updateListItem(field.key, i, "subject", e.currentTarget.value)} />
						</div>
						<div class="space-y-1">
							<Label class="text-xs">Time</Label>
							<Input
								value={String(email.time ?? "")}
								oninput={(e) => updateListItem(field.key, i, "time", e.currentTarget.value)}
								placeholder="14:30"
							/>
						</div>
					</div>
					<div class="space-y-1">
						<Label class="text-xs">Body</Label>
						<Textarea rows={2} value={String(email.body ?? "")} oninput={(e) => updateListItem(field.key, i, "body", e.currentTarget.value)} />
					</div>
				</div>
			{/each}
			<Button type="button" variant="outline" size="sm" onclick={() => addListItem(field.key, { from: "", to: "", subject: "", body: "" })}
				>+ Add Email</Button
			>
		</fieldset>
	{:else if field.type === "ao3-comment-tree"}
		<fieldset class="space-y-3">
			<legend class="text-sm font-medium">{field.label}</legend>
			{#each getList(field.key) as comment, i (i)}
				{@render renderAo3Comment(field.key, comment, [i], 0)}
			{/each}
			<Button
				type="button"
				variant="outline"
				size="sm"
				onclick={() => addListItem(field.key, { username: "", comment: "", timestamp: "", replies: [] })}
				>+ Add Top-level Comment</Button
			>
		</fieldset>
	{:else if field.type === "comment-list"}
		{@const authorField = field.authorField ?? "author"}
		{@const textField = field.textField ?? "text"}
		{@const withVotes = field.withVotes !== false}
		<fieldset class="space-y-3">
			<legend class="text-sm font-medium">{field.label}</legend>
			{#each getList(field.key) as comment, i (i)}
				<div class="flex gap-2 rounded border border-input p-2">
					<Input
						class="w-32"
						value={String(comment[authorField] ?? "")}
						placeholder={field.authorPlaceholder ?? "Author"}
						oninput={(e) => updateListItem(field.key, i, authorField, e.currentTarget.value)}
					/>
					<Input
						class="flex-1"
						value={String(comment[textField] ?? "")}
						placeholder={field.textPlaceholder ?? "Comment text"}
						oninput={(e) => updateListItem(field.key, i, textField, e.currentTarget.value)}
					/>
					{#if withVotes}
						<Input
							class="w-20"
							type="number"
							value={comment.votes ?? ""}
							placeholder="Votes"
							oninput={(e) => updateListItem(field.key, i, "votes", e.currentTarget.value ? Number(e.currentTarget.value) : undefined)}
						/>
					{/if}
					<Button type="button" variant="ghost" size="sm" onclick={() => removeListItem(field.key, i)}>×</Button>
				</div>
			{/each}
			<Button
				type="button"
				variant="outline"
				size="sm"
				onclick={() => {
				const item: Record<string, unknown> = { [authorField]: "", [textField]: "" };
				addListItem(field.key, item);
			}}
				>+ Add Comment</Button
			>
		</fieldset>
	{:else if field.type === "group"}
		<fieldset class="space-y-3 rounded border border-input p-3">
			<legend class="text-sm font-medium px-1">{field.label}</legend>
			{#each field.fields as sub}
				{#if sub.type === "row"}
					<div class="grid gap-3 sm:grid-cols-2">
						{#each sub.fields as inner}
							{@render renderField(inner, field.key)}
						{/each}
					</div>
				{:else}
					{@render renderField(sub, field.key)}
				{/if}
			{/each}
		</fieldset>
	{/if}
{/snippet}

{#snippet renderAo3Comment(key: string, comment: Record<string, unknown>, path: number[], depth: number)}
	<div class="space-y-2 rounded border border-input p-3" style={`margin-left: ${Math.min(depth, 4) * 1.25}rem`}>
		<div class="flex items-center justify-between gap-2">
			<span class="text-xs text-muted-foreground">Comment {path.map((n) => n + 1).join(".")}</span>
			<div class="flex gap-1">
				<Button type="button" variant="ghost" size="sm" onclick={() => addAo3Reply(key, path)}>Reply</Button>
				<Button type="button" variant="ghost" size="sm" onclick={() => removeAo3Comment(key, path)}>×</Button>
			</div>
		</div>
		<div class="grid gap-2 sm:grid-cols-2">
			<div class="space-y-1">
				<Label class="text-xs">Username</Label>
				<Input value={String(comment.username ?? "")} oninput={(e) => updateAo3CommentField(key, path, "username", e.currentTarget.value)} />
			</div>
			<div class="space-y-1">
				<Label class="text-xs">Timestamp</Label>
				<Input
					value={String(comment.timestamp ?? "")}
					placeholder="Sun 20 Apr 2025 11:05PM"
					oninput={(e) => updateAo3CommentField(key, path, "timestamp", e.currentTarget.value)}
				/>
			</div>
		</div>
		<div class="space-y-1">
			<Label class="text-xs">Icon URL (optional)</Label>
			<Input value={String(comment.iconUrl ?? "")} oninput={(e) => updateAo3CommentField(key, path, "iconUrl", e.currentTarget.value)} />
		</div>
		<div class="space-y-1">
			<Label class="text-xs">Comment</Label>
			<Textarea rows={3} value={String(comment.comment ?? "")} oninput={(e) => updateAo3CommentField(key, path, "comment", e.currentTarget.value)} />
		</div>
		{#if getAo3Replies(comment).length > 0}
			<div class="space-y-2 pt-1">
				{#each getAo3Replies(comment) as reply, i (i)}
					{@render renderAo3Comment(key, reply, [...path, i], depth + 1)}
				{/each}
			</div>
		{/if}
	</div>
{/snippet}
