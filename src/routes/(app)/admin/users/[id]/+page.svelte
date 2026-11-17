<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import { account } from "#lib/account/account.svelte.ts";
import { fmtCost, fmtDay, fmtWhen, langEn } from "#lib/admin/records.ts";
import { deleteOneUser, userCalls, userOne } from "#lib/admin/users.remote.ts";
import ModalDialog from "#lib/components/common/ModalDialog.svelte";
import { toast } from "#lib/components/shell/toast.svelte.ts";
import Button from "#lib/components/ui/button/button.svelte";
import { goto } from "$app/navigation";
import { page } from "$app/state";

/*
 * One account: what it is, and its model calls over the thirty days they are kept (the words only while the learner
 * helps improve Libiamo, read on the session's page). Deleting it deletes everything of theirs; the address is typed
 * again first.
 */
const id = $derived(page.params.id ?? "");
const u = $derived(await userOne(id));
const calls = $derived(await userCalls(id));
let deleting = $state(false);
let typed = $state("");
let busy = $state(false);
async function remove() {
	if (!u || busy) return;
	busy = true;
	const ok = await deleteOneUser({ id: u.id, email: typed })
		.then(() => true)
		.catch(() => false);
	busy = false;
	if (!ok) return toast("Could not delete it");
	deleting = false;
	toast("Account deleted");
	goto("/admin/users", { replace: true });
}
const facts = $derived(
	u
		? [
				["Email", `${u.email}${u.verified ? "" : " (unverified)"}`],
				["Role", u.role],
				["Languages", u.native ? `${langEn(u.native)} → ${u.learning.map(langEn).join(", ") || "—"}` : "Not set up"],
				["Key", u.provider ? `${u.provider} · ${u.model}` : "None"],
				["Helps improve Libiamo", u.helpImprove ? "Yes: calls keep their words" : "No: calls keep numbers only"],
				["Joined", fmtDay(u.createdAt)],
				["Last seen", u.lastSeen ? fmtWhen(u.lastSeen) : "—"],
				["Writing", `${u.pieces} pieces · ${u.notes} notebook entries`],
				["Calls kept", `${u.calls} · ${fmtCost(u.cost)}`],
			]
		: [],
);
</script>

<div class="adm-page">
	<a class="adm-back" href="/admin/users"><ArrowLeft class="size-4" aria-hidden="true" />Users</a>
	{#if !u}
		<p class="adm-empty adm-paper">No such account.</p>
	{:else}
		<header class="adm-head">
			<h1>{u.name || u.email}</h1>
			{#if u.email !== account.me.email}
				<div class="acts">
					<Button
						variant="destructive"
						onclick={() => {
							typed = "";
							deleting = true;
						}}
						>Delete account</Button
					>
				</div>
			{/if}
		</header>
		<dl class="adm-paper facts">
			{#each facts as [k, v] (k)}
				<dt>{k}</dt>
				<dd>{v}</dd>
			{/each}
		</dl>

		<section class="adm-section" aria-labelledby="h-calls">
			<h2 id="h-calls">Calls <span class="n">{calls.length}{calls.length >= 300 ? "+" : ""}</span></h2>
			<div class="adm-paper">
				{#if calls.length}
					<table class="call-table">
						<thead>
							<tr>
								<th>When</th>
								<th>Call</th>
								<th>Model</th>
								<th class="r">Tokens</th>
								<th class="r">Time</th>
								<th class="r">Cost</th>
							</tr>
						</thead>
						<tbody>
							{#each calls as c (c.id)}
								<tr class:bad={c.state === "failed"}>
									<td class="nowrap">{fmtWhen(c.at)}</td>
									<td>
										<span class="pp">{c.purpose || c.tag}</span>
										{#if c.piece}
											{#if u.helpImprove}
												<a class="pc" href="/admin/sessions/{c.piece.id}">{c.piece.title || "Untitled"}</a>
											{:else}
												<span class="pc">{c.piece.title || "Untitled"}</span>
											{/if}
										{/if}
										{#if c.error}
											<span class="err">{c.error}</span>
										{/if}
									</td>
									<td class="mono">{c.model}</td>
									<td class="r">{c.tokens}</td>
									<td class="r">{(c.ms / 1000).toFixed(1)} s</td>
									<td class="r">{fmtCost(c.cost)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{:else}
					<p class="adm-empty">No calls in the last thirty days.</p>
				{/if}
			</div>
		</section>
	{/if}
</div>

<ModalDialog bind:open={deleting} labelledby="del-h">
	<h2 id="del-h" class="mb-2">Delete this account?</h2>
	<p class="imp-p">Everything of theirs goes with it: writing, notebook, scenarios played, calls. Type their address to confirm.</p>
	<input class="adm-input w-full" bind:value={typed} placeholder={u?.email} aria-label="Their address" data-initial-focus>
	<div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
		<Button variant="secondary" onclick={() => (deleting = false)}>Cancel</Button>
		<Button variant="destructive-solid" disabled={busy || typed.trim().toLowerCase() !== u?.email.toLowerCase()} onclick={remove}>Delete</Button>
	</div>
</ModalDialog>

<style>
.facts {
	display: grid;
	grid-template-columns: 12rem minmax(0, 1fr);
	gap: 8px 16px;
	margin: 0 0 8px;
	padding: 16px 20px;
	font-size: 14px;
}
dt {
	color: var(--muted);
}
dd {
	margin: 0;
	overflow-wrap: anywhere;
}
.n {
	font-family: var(--font-sans-stack);
	font-size: 13px;
	color: var(--muted);
}
.call-table {
	width: 100%;
	border-collapse: collapse;
	font-size: 13px;
}
.call-table th {
	padding: 8px 12px;
	text-align: left;
	font-weight: 500;
	color: var(--muted);
	border-bottom: 1px solid var(--line-soft);
}
.call-table td {
	padding: 7px 12px;
	border-bottom: 1px solid var(--line-soft);
	vertical-align: top;
}
.call-table tr:last-child td {
	border-bottom: 0;
}
.r {
	text-align: right;
	white-space: nowrap;
}
.nowrap {
	white-space: nowrap;
}
.pp {
	display: block;
}
.pc {
	display: block;
	color: var(--muted);
	font-size: 12px;
}
.err {
	display: block;
	color: var(--warn);
	font-size: 12px;
}
.bad .pp {
	color: var(--warn);
}
.mono {
	font-family: var(--font-mono-stack, ui-monospace, monospace);
	font-size: 12px;
}
.imp-p {
	margin: 0 0 14px;
	color: var(--ink-2);
	font-size: 14px;
}
@container (max-width: 640px) {
	.facts {
		grid-template-columns: minmax(0, 1fr);
	}
	.call-table th:nth-child(3),
	.call-table td:nth-child(3),
	.call-table th:nth-child(5),
	.call-table td:nth-child(5) {
		display: none;
	}
}
</style>
