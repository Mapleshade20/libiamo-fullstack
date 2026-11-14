<script lang="ts">
import type { Snippet } from "svelte";
import Disc from "./Disc.svelte";

/* Someone speaking in the session: their disc, their name (with anything that goes beside it), what they say. A message
   right after one of theirs (`grouped`) goes on without the disc and the name. */
let {
	who,
	icon,
	kind = "",
	quiet = false,
	grouped = false,
	aside,
	children,
}: {
	who: { name: string; color: string };
	icon: string;
	kind?: string;
	quiet?: boolean;
	grouped?: boolean;
	aside?: Snippet;
	children: Snippet;
} = $props();
</script>

<div class="cm {kind}" class:quiet class:grouped style:--who={who.color}>
	{#if grouped}
		<span class="disc-space"></span>
	{:else}
		<Disc {icon} color={who.color} />
	{/if}
	<div class="cm-body">
		{#if !grouped}
			<div class="cm-name">
				<span>{who.name}</span>
				{#if aside}
					{@render aside()}
				{/if}
			</div>
		{/if}
		<div class="cm-text">{@render children()}</div>
	</div>
</div>

<style>
.cm {
	display: flex;
	gap: 10px;
	margin-bottom: 10px;
}
.cm-body {
	flex: 1;
	min-width: 0;
}
.cm-name {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	justify-content: space-between;
	gap: 0 16px;
	font-size: 13px;
	font-weight: 600;
	line-height: 28px;
}
.grouped {
	margin-top: -8px;
}
.disc-space {
	flex: none;
	width: 28px;
}
.cm-text {
	font-size: 15px;
	line-height: 1.55;
}
.reader .cm-text {
	font-family: var(--font-serif-stack);
	font-style: italic;
	font-size: 17px;
	line-height: 1.45;
}
/* Only the learner's own words keep their line breaks: the gaps around them in the markup must not become lines. */
.me .cm-text > :global(p) {
	white-space: pre-wrap;
}
.quiet .cm-text {
	color: var(--muted);
	font-size: 14px;
}
:global(:root:is(:lang(ar), :lang(fa))) .cm-text {
	unicode-bidi: plaintext;
}
</style>
