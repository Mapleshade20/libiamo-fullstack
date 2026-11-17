<script lang="ts">
import Search from "@lucide/svelte/icons/search";
import { fmtCost, fmtDay, langEn } from "#lib/admin/records.ts";
import { userList } from "#lib/admin/users.remote.ts";
import { tip } from "#lib/components/common/tip.ts";

/*
 * Every account, newest first: who they are, the languages and key they set up, how much they write and what their
 * model calls cost over the thirty days the calls are kept. One opens on its calls, and can be deleted there. They come
 * fifty at a time, found on the server (server/admin/users.ts); the next page is asked for as the end comes near.
 */
type UserRow = Awaited<ReturnType<typeof userList>>["rows"][number];
let q = $state("");
// What is searched for, once typing pauses.
let asked = $state("");
$effect(() => {
	const now = q.trim();
	const t = setTimeout(() => (asked = now), 250);
	return () => clearTimeout(t);
});
const first = $derived(await userList({ q: asked, page: 0 }));
let more = $state<{ q: string; rows: UserRow[]; page: number; more: boolean }>({ q: "\u0000", rows: [], page: 0, more: false });
const later = $derived(more.q === asked ? more : { q: asked, rows: [] as UserRow[], page: 0, more: first.more });
const list = $derived.by(() => {
	const seen = new Set(first.rows.map((u) => u.id));
	return [...first.rows, ...later.rows.filter((u) => !seen.has(u.id))];
});
let asking = false;
async function askMore() {
	if (asking || !later.more) return;
	asking = true;
	const at = asked;
	try {
		const page = later.page + 1;
		const next = await userList({ q: at, page });
		if (at === asked) more = { q: at, rows: [...later.rows, ...next.rows], page, more: next.more };
	} finally {
		asking = false;
	}
}
function nearing(node: HTMLElement) {
	const seen = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && askMore(), { rootMargin: "600px" });
	seen.observe(node);
	return { destroy: () => seen.disconnect() };
}
</script>

<div class="adm-page">
	<header class="adm-head">
		<h1>Users <span class="n">{first.total}</span></h1>
	</header>
	<div class="adm-filters">
		<span class="grow"></span>
		<label class="adm-search"
			><Search class="size-4" aria-hidden="true" />
			<input class="adm-input" type="search" placeholder="Search" aria-label="Search users" bind:value={q}></label
		>
	</div>
	<div class="adm-paper">
		{#if list.length}
			<ul class="adm-rows">
				{#each list as u (u.id)}
					<li>
						<a class="adm-row" href="/admin/users/{u.id}">
							<div class="main">
								<div class="t">
									{u.name || "—"}
									{#if u.role === "admin"}
										<span class="adm-tag">Admin</span>
									{/if}
									{#if !u.onboarded}
										<span class="adm-tag">Not set up</span>
									{/if}
									{#if !u.verified}
										<span class="adm-tag warn">Unverified</span>
									{/if}
								</div>
								<div class="s">
									<span>{u.email}</span>
									{#if u.native}
										<span class="adm-dot">{langEn(u.native)} → {u.learning.map(langEn).join(", ") || "—"}</span>
									{/if}
									<span class="adm-dot">{u.provider ? `${u.provider} · ${u.model}` : "No key"}</span>
									{#if !u.helpImprove}
										<span class="adm-dot">Calls without words</span>
									{/if}
								</div>
							</div>
							<div class="nums">
								<span class="adm-meta" use:tip={"Joined · last seen"}>{fmtDay(u.createdAt)}{u.lastSeen ? ` · ${fmtDay(u.lastSeen)}` : ""}</span>
								<span class="adm-meta">{u.pieces} pieces · {u.notes} notes · {u.calls} calls · {fmtCost(u.cost)}</span>
							</div>
						</a>
					</li>
				{/each}
			</ul>
			{#if later.more}
				<div class="more" use:nearing aria-hidden="true"></div>
			{/if}
		{:else}
			<p class="adm-empty">No account matches.</p>
		{/if}
	</div>
</div>

<style>
.more {
	height: 1px;
}
.grow {
	flex: 1;
}
.n {
	font-family: var(--font-sans-stack);
	font-size: 15px;
	color: var(--muted);
}
.t {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}
.nums {
	display: flex;
	flex: none;
	flex-direction: column;
	align-items: flex-end;
	gap: 2px;
}
@container (max-width: 640px) {
	.adm-row {
		flex-direction: column;
		align-items: flex-start;
	}
	.nums {
		align-items: flex-start;
	}
}
</style>
