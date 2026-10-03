<script lang="ts">
import { base } from "$app/paths";
import { page } from "$app/state";
import FloatingPanel from "$lib/components/common/FloatingPanel.svelte";
import Switch from "$lib/components/common/Switch.svelte";
import { Badge } from "$lib/components/ui/badge";
import { Button } from "$lib/components/ui/button";
import { getDisplayClock } from "$lib/time/display-clock";
import { formatLabTime, formatLatency, ORIGIN_LABELS } from "./format";

/**
 * Staff-only: the viewer's own LLM calls, narrowed to the task the page shows. Loaded with a dynamic
 * import from the app layout, so learners never download it.
 */
type InspectorTrace = {
	id: string;
	createdAt: string;
	recipeTitle: string;
	origin: keyof typeof ORIGIN_LABELS;
	status: "ok" | "error";
	latencyMs: number;
	model: string | null;
	repaired: boolean;
};

const POLL_MS = 4_000;
const clock = getDisplayClock();

let open = $state(false);
let onlyThisTask = $state(true);
let traces = $state<InspectorTrace[] | null>(null);
let activeOverrides = $state(0);
let failed = $state(false);

const taskId = $derived(page.route.id?.includes("/task/[id]") ? Number(page.params.id) || null : null);
const scopedTaskId = $derived(onlyThisTask ? taskId : null);

async function refresh(signal?: AbortSignal) {
	try {
		const response = await fetch(`${base}/api/llm/traces${scopedTaskId ? `?task=${scopedTaskId}` : ""}`, { signal });
		if (!response.ok) throw new Error(String(response.status));
		const body = (await response.json()) as { traces: InspectorTrace[]; activeOverrides: number };
		traces = body.traces;
		activeOverrides = body.activeOverrides;
		failed = false;
	} catch (error) {
		if ((error as Error).name !== "AbortError") failed = true;
	}
}

// The override marker must be visible before the panel is opened.
$effect(() => {
	const controller = new AbortController();
	void refresh(controller.signal);
	return () => controller.abort();
});

$effect(() => {
	if (!open) return;
	void scopedTaskId;
	const controller = new AbortController();
	void refresh(controller.signal);
	const timer = setInterval(() => void refresh(controller.signal), POLL_MS);
	return () => {
		clearInterval(timer);
		controller.abort();
	};
});
</script>

<!-- Above the full-screen session shells (z-999) and their drawers and toasts (up to z-2000), below their entry splash (z-3000). -->
<div class="fixed right-0 top-1/2 z-[2500] -translate-y-1/2 print:hidden">
	<FloatingPanel
		bind:open
		label="LLM calls"
		triggerClass="flex-col gap-1 rounded-l-xl rounded-r-none border border-r-0 border-border bg-card/95 px-2 py-3 text-xs font-medium text-muted-foreground shadow-sm hover:text-foreground"
		class="z-[2500] flex w-[22rem] flex-col overflow-hidden [--floating-panel-padding:0.75rem]"
	>
		{#snippet trigger()}
			<span class="[writing-mode:vertical-rl]">LLM</span>
			{#if activeOverrides > 0}
				<span class="size-2 rounded-full bg-warning" aria-hidden="true"></span>
				<span class="sr-only">{activeOverrides} active overrides</span>
			{/if}
		{/snippet}
		<div class="flex min-h-0 flex-1 flex-col gap-3">
			<div class="flex items-center justify-between gap-2">
				<p class="text-sm font-medium">My LLM calls</p>
				<Button href="{base}/admin/lab/traces" variant="ghost" size="sm">All traces</Button>
			</div>
			{#if activeOverrides > 0}
				<p class="rounded-lg bg-warning/[0.1] px-2.5 py-2 text-xs">
					{activeOverrides}
					override{activeOverrides === 1 ? "" : "s"}
					active on your account.
					<a href="{base}/admin/lab/overrides" class="underline underline-offset-2">Manage</a>
				</p>
			{/if}
			{#if taskId}
				<label class="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-sm">
					Only task #{taskId}
					<Switch bind:checked={onlyThisTask} />
				</label>
			{/if}
			{#if failed}
				<p class="text-xs text-destructive" role="alert">Could not load calls.</p>
			{:else if traces === null}
				<p class="text-xs text-muted-foreground">Loading…</p>
			{:else if traces.length === 0}
				<p class="text-xs text-muted-foreground">No calls captured yet{scopedTaskId ? " for this task" : ""}.</p>
			{:else}
				<ul class="-mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain" aria-live="polite">
					{#each traces as trace (trace.id)}
						<li>
							<a href="{base}/admin/lab/traces/{trace.id}" class="floating-menu-item flex-col items-stretch gap-0 px-2 py-1.5">
								<span class="flex items-center justify-between gap-2 text-sm">
									<span class="truncate">{trace.recipeTitle}</span>
									{#if trace.status === "error"}
										<Badge variant="destructive">Error</Badge>
									{:else if trace.repaired}
										<Badge variant="outline">Repaired</Badge>
									{/if}
								</span>
								<span class="text-xs text-muted-foreground tabular-nums">
									{formatLabTime(trace.createdAt, clock().timeZone)}
									· {formatLatency(trace.latencyMs)}{trace.origin === "override" ? ` · ${ORIGIN_LABELS.override}` : ""}
									{trace.model ? ` · ${trace.model}` : ""}
								</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</FloatingPanel>
</div>
