<script lang="ts">
import Search from "@lucide/svelte/icons/search";
import { fmtCost, fmtDay, langEn } from "#lib/admin/records.ts";
import { userList } from "#lib/admin/users.remote.ts";
import { tip } from "#lib/components/common/tip.ts";

/*
 * Every account, newest first: who they are, the languages and key they set up, how much they write and what their
 * model calls cost over the thirty days the calls are kept. One opens on its calls, and can be deleted there.
 */
const all = $derived(await userList());
let q = $state("");
const list = $derived(all.filter((u) => !q.trim() || `${u.name} ${u.email} ${u.id}`.toLowerCase().includes(q.trim().toLowerCase())));
</script>

<div class="adm-page">
	<header class="adm-head">
		<h1>Users <span class="n">{all.length}</span></h1>
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
		{:else}
			<p class="adm-empty">No account matches.</p>
		{/if}
	</div>
</div>

<style>
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
