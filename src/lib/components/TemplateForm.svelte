<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';

	type TemplateData = {
		language?: string;
		type?: string;
		ui?: string;
		duration?: string;
		difficulty?: number;
		maxTurns?: number | null;
		estimatedWords?: number | null;
		pointReward?: number;
		gemReward?: number;
		isActive?: boolean;
		titleBase?: string;
		descriptionBase?: string | null;
		agentPromptBase?: string | null;
		backgroundHtml?: string | null;
		objectivesBase?: unknown;
		agentPersonaPool?: unknown;
		candidates?: unknown;
	};

	let {
		template = {} as TemplateData,
		form = null as Record<string, unknown> | null,
		action = '',
		submitLabel = 'Save'
	} = $props();

	function jsonStr(val: unknown): string {
		if (!val) return '';
		try {
			return JSON.stringify(val, null, 2);
		} catch {
			return '';
		}
	}
</script>

<form method="POST" {action} use:enhance class="space-y-8">
	{#if form?.message}
		<p class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.message}</p>
	{/if}

	<!-- Section A: Metadata -->
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		<div class="space-y-2">
			<Label for="language">Language</Label>
			<select id="language" name="language" class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required>
				<option value="en" selected={template.language === 'en'}>English</option>
				<option value="es" selected={template.language === 'es'}>Spanish</option>
				<option value="fr" selected={template.language === 'fr'}>French</option>
				<option value="ja" selected={template.language === 'ja'}>Japanese</option>
			</select>
			{#if form?.errors?.language}<p class="text-sm text-red-600">{form.errors.language[0]}</p>{/if}
		</div>

		<div class="space-y-2">
			<Label for="type">Type</Label>
			<select id="type" name="type" class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required>
				<option value="chat" selected={template.type === 'chat'}>Chat</option>
				<option value="oneshot" selected={template.type === 'oneshot'}>Oneshot</option>
				<option value="slow" selected={template.type === 'slow'}>Slow</option>
				<option value="translate" selected={template.type === 'translate'}>Translate</option>
			</select>
			{#if form?.errors?.type}<p class="text-sm text-red-600">{form.errors.type[0]}</p>{/if}
		</div>

		<div class="space-y-2">
			<Label for="ui">UI Variant</Label>
			<select id="ui" name="ui" class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required>
				<option value="reddit" selected={template.ui === 'reddit'}>Reddit</option>
				<option value="apple_mail" selected={template.ui === 'apple_mail'}>Apple Mail</option>
				<option value="discord" selected={template.ui === 'discord'}>Discord</option>
				<option value="imessage" selected={template.ui === 'imessage'}>iMessage</option>
				<option value="ao3" selected={template.ui === 'ao3'}>AO3</option>
				<option value="translator" selected={template.ui === 'translator'}>Translator</option>
			</select>
			{#if form?.errors?.ui}<p class="text-sm text-red-600">{form.errors.ui[0]}</p>{/if}
		</div>

		<div class="space-y-2">
			<Label for="duration">Duration</Label>
			<select id="duration" name="duration" class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required>
				<option value="weekly" selected={template.duration === 'weekly'}>Weekly</option>
				<option value="daily" selected={template.duration === 'daily'}>Daily</option>
			</select>
			{#if form?.errors?.duration}<p class="text-sm text-red-600">{form.errors.duration[0]}</p>{/if}
		</div>

		<div class="space-y-2">
			<Label for="difficulty">Difficulty (1-3)</Label>
			<Input id="difficulty" name="difficulty" type="number" min="1" max="3" value={template.difficulty ?? 1} required />
			{#if form?.errors?.difficulty}<p class="text-sm text-red-600">{form.errors.difficulty[0]}</p>{/if}
		</div>

		<div class="space-y-2">
			<Label for="maxTurns">Max Turns</Label>
			<Input id="maxTurns" name="maxTurns" type="number" min="0" value={template.maxTurns ?? ''} />
		</div>

		<div class="space-y-2">
			<Label for="estimatedWords">Estimated Words</Label>
			<Input id="estimatedWords" name="estimatedWords" type="number" min="0" value={template.estimatedWords ?? ''} />
		</div>

		<div class="space-y-2">
			<Label for="pointReward">Point Reward</Label>
			<Input id="pointReward" name="pointReward" type="number" min="0" value={template.pointReward ?? 3} required />
			{#if form?.errors?.pointReward}<p class="text-sm text-red-600">{form.errors.pointReward[0]}</p>{/if}
		</div>

		<div class="space-y-2">
			<Label for="gemReward">Gem Reward</Label>
			<Input id="gemReward" name="gemReward" type="number" min="0" value={template.gemReward ?? 30} required />
			{#if form?.errors?.gemReward}<p class="text-sm text-red-600">{form.errors.gemReward[0]}</p>{/if}
		</div>

		<div class="flex items-center gap-2 pt-6">
			<input id="isActive" name="isActive" type="checkbox" checked={template.isActive ?? true} class="rounded border-input" />
			<Label for="isActive">Active</Label>
		</div>
	</div>

	<!-- Section B: Content -->
	<div class="space-y-4">
		<div class="space-y-2">
			<Label for="titleBase">Title (supports &#123;&#123;slot&#125;&#125; placeholders)</Label>
			<Input id="titleBase" name="titleBase" value={template.titleBase ?? ''} required />
			{#if form?.errors?.titleBase}<p class="text-sm text-red-600">{form.errors.titleBase[0]}</p>{/if}
		</div>

		<div class="space-y-2">
			<Label for="descriptionBase">Description</Label>
			<Textarea id="descriptionBase" name="descriptionBase" rows={3} value={template.descriptionBase ?? ''} />
		</div>

		<div class="space-y-2">
			<Label for="agentPromptBase">Agent Prompt</Label>
			<Textarea id="agentPromptBase" name="agentPromptBase" rows={4} value={template.agentPromptBase ?? ''} />
		</div>

		<div class="space-y-2">
			<Label for="backgroundHtml">Background HTML</Label>
			<Textarea id="backgroundHtml" name="backgroundHtml" rows={4} value={template.backgroundHtml ?? ''} />
		</div>

		<div class="space-y-2">
			<Label for="objectivesBase">Objectives (JSON)</Label>
			<Textarea
				id="objectivesBase"
				name="objectivesBase"
				rows={4}
				value={jsonStr(template.objectivesBase) || '[{"order": 1, "text": "..."}]'}
				placeholder={'[{"order": 1, "text": "Greet the user"}]'}
			/>
			{#if form?.errors?.objectivesBase}<p class="text-sm text-red-600">{form.errors.objectivesBase[0]}</p>{/if}
		</div>

		<div class="space-y-2">
			<Label for="agentPersonaPool">Agent Persona Pool (JSON)</Label>
			<Textarea
				id="agentPersonaPool"
				name="agentPersonaPool"
				rows={4}
				value={jsonStr(template.agentPersonaPool) || '[{"name": "...", "personality": "..."}]'}
				placeholder={'[{"name": "Maria", "age": 25, "personality": "friendly"}]'}
			/>
			{#if form?.errors?.agentPersonaPool}<p class="text-sm text-red-600">{form.errors.agentPersonaPool[0]}</p>{/if}
		</div>

		<div class="space-y-2">
			<Label for="candidates">Candidates (JSON)</Label>
			<Textarea
				id="candidates"
				name="candidates"
				rows={5}
				value={jsonStr(template.candidates) || '[{"slots": {"topic": "..."}, "context": {}}]'}
				placeholder={'[{"slots": {"topic": "food"}, "context": {"subreddit": "r/askspain"}}]'}
			/>
			{#if form?.errors?.candidates}<p class="text-sm text-red-600">{form.errors.candidates[0]}</p>{/if}
		</div>
	</div>

	<div class="flex gap-3">
		<Button type="submit">{submitLabel}</Button>
		<Button href="/admin/templates" variant="outline">Cancel</Button>
	</div>
</form>
