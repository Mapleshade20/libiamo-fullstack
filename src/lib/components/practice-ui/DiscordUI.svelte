<script lang="ts">
import AlertCircle from "@lucide/svelte/icons/alert-circle";
import Bell from "@lucide/svelte/icons/bell";
import CheckCircle from "@lucide/svelte/icons/check-circle";
import ChevronDown from "@lucide/svelte/icons/chevron-down";
import Gift from "@lucide/svelte/icons/gift";
import Hash from "@lucide/svelte/icons/hash";
import Headphones from "@lucide/svelte/icons/headphones";
import Info from "@lucide/svelte/icons/info";
import LogOut from "@lucide/svelte/icons/log-out";
import Mic from "@lucide/svelte/icons/mic";
import Pin from "@lucide/svelte/icons/pin";
import Plus from "@lucide/svelte/icons/plus";
import Settings from "@lucide/svelte/icons/settings";
import Smile from "@lucide/svelte/icons/smile";
import Sticker from "@lucide/svelte/icons/sticker";
import Users from "@lucide/svelte/icons/users";
import { onMount, tick } from "svelte";
import { fade } from "svelte/transition";
import { deserialize } from "$app/forms";
import { invalidateAll } from "$app/navigation";
import { COMMON_EMOJIS } from "./emojis";
import { COLOR_POOL, STATUS_POOL, USER_POOL } from "./mockData";

interface Props {
	taskId?: string | number;
	userName?: string;
	avatarUrl?: string;
	language?: string;
	existingSession?: any;
}

let { taskId = "", userName = "Learner", avatarUrl = "", language = "en", existingSession = null }: Props = $props();

const serverName = $derived(`${userName}'s Server`);
const serverAcronym = $derived(
	serverName
		.split(" ")
		.map((w) => w[0])
		.join("")
		.slice(0, 2)
		.toUpperCase(),
);

const i18n = {
	en: {
		textChannels: "TEXT CHANNELS",
		voiceChannels: "VOICE CHANNELS",
		general: "general",
		online: "Online",
		offline: "Offline",
		messagePlaceholder: "Message #general",
		returnTask: "Return to Task",
		unavailableFeature: "In the immersive learning context, this feature is unavailable.",
	},
	es: {
		textChannels: "CANALES DE TEXTO",
		voiceChannels: "CANALES DE VOZ",
		general: "general",
		online: "En línea",
		offline: "Desconectado",
		messagePlaceholder: "Enviar mensaje a #general",
		returnTask: "Volver a la tarea",
		unavailableFeature: "En el contexto de aprendizaje inmersivo, esta función no está disponible.",
	},
	fr: {
		textChannels: "SALONS TEXTUELS",
		voiceChannels: "SALONS VOCAUX",
		general: "général",
		online: "En ligne",
		offline: "Hors ligne",
		messagePlaceholder: "Envoyer un message à #général",
		returnTask: "Retour à la tâche",
		unavailableFeature: "Dans le contexte d'apprentissage immersif, cette fonctionnalité n'est pas disponible.",
	},
	ja: {
		textChannels: "テキストチャンネル",
		voiceChannels: "ボイスチャンネル",
		general: "一般",
		online: "オンライン",
		offline: "オフライン",
		messagePlaceholder: "#一般 へメッセージを送信",
		returnTask: "タスクに戻る",
		unavailableFeature: "没入型学習コンテキストでは、この機能は利用できません。",
	},
};
const t = $derived(i18n[language as keyof typeof i18n] || i18n.en);

type Message = {
	id: string;
	role: "user" | "agent";
	text: string;
	timestamp: string;
	authorName: string;
	avatar?: string;
	avatarColor?: string;
	isHidden?: boolean;
};

type ObjectiveResult = { text: string; grade: "A" | "B" | "C" };
type TutorFeedback = {
	content: string;
	objectiveResults: ObjectiveResult[];
};
type DiscordUser = {
	id: string;
	name: string;
	status: string;
	color: string;
	isAgent: boolean;
};

let sessionId = $state<number | null>(null);
let lastLoadedSessionId = $state<number | null>(null);
let isSubmitting = $state(false);
let isCompleting = $state(false);
let isCompleted = $state(false);
let isInitializing = $state(false);
let feedback = $state<TutorFeedback | null>(null);
let messages = $state<Message[]>([]);

let agentUser = $state<DiscordUser>({
	id: "agent",
	name: "Agent",
	status: "Online",
	color: "bg-[#5865F2]",
	isAgent: true,
});
let onlineUsers = $state<DiscordUser[]>([]);
let offlineUsers = $state<DiscordUser[]>([]);
let allUsers = $derived([agentUser, ...onlineUsers, ...offlineUsers]);

let inputRef = $state<HTMLInputElement | null>(null);
let inputText = $state("");
let chatContainer: HTMLElement;
let showToast = $state(false);
let toastTimeout: ReturnType<typeof setTimeout>;
let showMembers = $state(true);

let showMentionMenu = $state(false);
let mentionQuery = $state("");
let mentionIndex = $state(0);
let filteredMentionUsers = $derived(allUsers.filter((u) => u.name.toLowerCase().includes(mentionQuery.toLowerCase())));

let contextMenu = $state({
	show: false,
	x: 0,
	y: 0,
	targetUser: null as DiscordUser | null,
});
let showEmojiPicker = $state(false);

function createSeededRandom(seed: number) {
	let state = seed ? seed * 1234567 : 1234567;
	return () => {
		state = (state * 9301 + 49297) % 233280;
		return state / 233280;
	};
}

function shuffleArray<T>(array: T[], randomFunc: () => number): T[] {
	const arr = [...array];
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(randomFunc() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr;
}

function initUserPool(seedId: number) {
	const random = createSeededRandom(seedId);
	const shuffledNames = shuffleArray(USER_POOL, random);

	agentUser = {
		id: "agent",
		name: shuffledNames.pop() || "Agent",
		status: STATUS_POOL[Math.floor(random() * STATUS_POOL.length)],
		color: COLOR_POOL[Math.floor(random() * COLOR_POOL.length)],
		isAgent: true,
	};

	const numOnline = Math.floor(random() * 3) + 1;
	const numOffline = Math.floor(random() * 4) + 2;

	const online = [];
	for (let i = 0; i < numOnline; i++) {
		online.push({
			id: `online_${i}`,
			name: shuffledNames.pop() || `User_${i}`,
			status: STATUS_POOL[Math.floor(random() * STATUS_POOL.length)],
			color: COLOR_POOL[Math.floor(random() * COLOR_POOL.length)],
			isAgent: false,
		});
	}
	onlineUsers = online;

	const offline = [];
	for (let i = 0; i < numOffline; i++) {
		offline.push({
			id: `offline_${i}`,
			name: shuffledNames.pop() || `Offline_${i}`,
			status: "Offline",
			color: COLOR_POOL[Math.floor(random() * COLOR_POOL.length)],
			isAgent: false,
		});
	}
	offlineUsers = offline;
}

$effect(() => {
	if (existingSession && existingSession.id !== lastLoadedSessionId) {
		const currentId = existingSession.id;
		lastLoadedSessionId = currentId;
		sessionId = currentId;

		initUserPool(currentId);

		isCompleted = existingSession.status === "completed" || existingSession.status === "evaluated";
		feedback = existingSession.tutorFeedback || null;

		messages =
			existingSession.messages?.map((m: any) => ({
				id: m.id.toString(),
				role: m.role === "user" ? "user" : "agent",
				text: m.content,
				timestamp: formatTime(new Date(m.createdAt)),
				authorName: m.role === "user" ? userName : agentUser.name,
				avatar: m.role === "user" ? avatarUrl : undefined,
				avatarColor: m.role !== "user" ? agentUser.color : undefined,
				isHidden: m.content === "*User joined the server*",
			})) || [];

		tick().then(() => {
			if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
		});
	}
});

onMount(async () => {
	const shuffledNames = [...USER_POOL].sort(() => 0.5 - Math.random());
	const numOnline = Math.floor(Math.random() * 3) + 1;
	const numOffline = Math.floor(Math.random() * 4) + 2;

	onlineUsers = Array.from({ length: numOnline }).map((_, i) => ({
		id: crypto.randomUUID(),
		name: shuffledNames.pop() || `User_${i}`,
		status: STATUS_POOL[Math.floor(Math.random() * STATUS_POOL.length)],
		color: COLOR_POOL[Math.floor(Math.random() * COLOR_POOL.length)],
		isAgent: false,
	}));

	offlineUsers = Array.from({ length: numOffline }).map((_, i) => ({
		id: crypto.randomUUID(),
		name: shuffledNames.pop() || `Offline_${i}`,
		status: "Offline",
		color: COLOR_POOL[Math.floor(Math.random() * COLOR_POOL.length)],
		isAgent: false,
	}));

	if (!existingSession) {
		isInitializing = true;
		try {
			const startData = new FormData();
			const startRes = await fetch(`?/start`, {
				method: "POST",
				body: startData,
			});
			const startResult = deserialize(await startRes.text());

			if (startResult.type === "success" && startResult.data) {
				const currentId = startResult.data.sessionId as number;
				sessionId = currentId;
				lastLoadedSessionId = currentId;

				initUserPool(currentId);

				const sendData = new FormData();
				sendData.append("sessionId", String(currentId));
				sendData.append("message", "*User joined the server*");

				const sendRes = await fetch(`?/send`, {
					method: "POST",
					body: sendData,
				});
				const sendResult = deserialize(await sendRes.text());

				if (sendResult.type === "success" && sendResult.data) {
					messages = [
						{
							id: crypto.randomUUID(),
							role: "user",
							text: "*User joined the server*",
							timestamp: formatTime(new Date()),
							authorName: userName,
							avatar: avatarUrl,
							isHidden: true,
						},
						{
							id: crypto.randomUUID(),
							role: "agent",
							text: sendResult.data.reply as string,
							timestamp: formatTime(new Date()),
							authorName: agentUser.name,
							avatarColor: agentUser.color,
						},
					];
					await scrollToBottom();
					await invalidateAll();
				}
			}
		} catch (error) {
			console.error("Initialization failed:", error);
		} finally {
			isInitializing = false;
		}
	}
});

async function scrollToBottom() {
	await tick();
	if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
}

function formatTime(date: Date) {
	return date.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});
}

function getTodayDateString() {
	return new Intl.DateTimeFormat(language === "en" ? "en-US" : language, {
		year: "numeric",
		month: "long",
		day: "numeric",
	}).format(new Date());
}

async function handleComplete() {
	if (!sessionId || isCompleting || isCompleted) return;
	isCompleting = true;
	try {
		const completeData = new FormData();
		completeData.append("sessionId", String(sessionId));
		const res = await fetch(`?/complete`, {
			method: "POST",
			body: completeData,
		});
		const result = deserialize(await res.text());

		if (result.type === "success" && result.data) {
			isCompleted = true;
			feedback = result.data.feedback as TutorFeedback;
			await scrollToBottom();
			await invalidateAll();
		}
	} catch (error) {
		console.error("Completion failed:", error);
	} finally {
		isCompleting = false;
	}
}

async function handleSend() {
	if (!inputText.trim() || isSubmitting || isCompleted || isInitializing) return;

	const currentText = inputText;
	inputText = "";
	showMentionMenu = false;
	showEmojiPicker = false;
	isSubmitting = true;

	messages = [
		...messages,
		{
			id: crypto.randomUUID(),
			role: "user",
			text: currentText,
			timestamp: formatTime(new Date()),
			authorName: userName,
			avatar: avatarUrl,
		},
	];
	await scrollToBottom();

	try {
		const sendData = new FormData();
		sendData.append("sessionId", String(sessionId));
		sendData.append("message", currentText);

		const sendRes = await fetch(`?/send`, {
			method: "POST",
			body: sendData,
		});
		const sendResult = deserialize(await sendRes.text());

		if (sendResult.type === "success" && sendResult.data) {
			messages = [
				...messages,
				{
					id: crypto.randomUUID(),
					role: "agent",
					text: sendResult.data.reply as string,
					timestamp: formatTime(new Date()),
					authorName: agentUser.name,
					avatarColor: agentUser.color,
				},
			];
			await scrollToBottom();
			await invalidateAll();

			if (sendResult.data.terminated) await handleComplete();
		}
	} catch (error) {
		console.error("Message submission failed:", error);
	} finally {
		isSubmitting = false;
	}
}

function handleInput() {
	if (!inputRef) return;
	const cursor = inputRef.selectionStart || 0;
	const textBeforeCursor = inputText.slice(0, cursor);
	const match = textBeforeCursor.match(/@([a-zA-Z0-9_]*)$/);

	if (match) {
		mentionQuery = match[1];
		showMentionMenu = true;
		mentionIndex = 0;
	} else {
		showMentionMenu = false;
	}
}

function handleKeydown(e: KeyboardEvent) {
	if (showMentionMenu && filteredMentionUsers.length > 0) {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			mentionIndex = (mentionIndex + 1) % filteredMentionUsers.length;
			return;
		}
		if (e.key === "ArrowUp") {
			e.preventDefault();
			mentionIndex = (mentionIndex - 1 + filteredMentionUsers.length) % filteredMentionUsers.length;
			return;
		}
		if (e.key === "Enter" || e.key === "Tab") {
			e.preventDefault();
			insertMention(filteredMentionUsers[mentionIndex]);
			return;
		}
		if (e.key === "Escape") {
			showMentionMenu = false;
			return;
		}
	}

	if (e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		handleSend();
	}
}

function insertMention(user: DiscordUser) {
	if (!inputRef) return;
	const cursor = inputRef.selectionStart || 0;
	const textBeforeCursor = inputText.slice(0, cursor);
	const textAfterCursor = inputText.slice(cursor);

	const match = textBeforeCursor.match(/@([a-zA-Z0-9_]*)$/);
	if (match) {
		const beforeMention = textBeforeCursor.slice(0, match.index);
		inputText = `${beforeMention}@${user.name} ${textAfterCursor}`;
		showMentionMenu = false;
		setTimeout(() => {
			inputRef?.focus();
			const newCursor = beforeMention.length + user.name.length + 2;
			inputRef?.setSelectionRange(newCursor, newCursor);
		}, 0);
	}
}

function insertEmoji(emoji: string) {
	if (!inputRef) {
		inputText += emoji;
		return;
	}
	const cursor = inputRef.selectionStart || 0;
	const textBeforeCursor = inputText.slice(0, cursor);
	const textAfterCursor = inputText.slice(cursor);

	inputText = `${textBeforeCursor}${emoji}${textAfterCursor}`;

	setTimeout(() => {
		inputRef?.focus();
		const newCursor = cursor + emoji.length;
		inputRef?.setSelectionRange(newCursor, newCursor);
	}, 0);
}

function handleContextMenu(e: MouseEvent, user: DiscordUser) {
	e.preventDefault();
	contextMenu = {
		show: true,
		x: e.clientX,
		y: e.clientY,
		targetUser: user,
	};
}

function handleContextMenuMention() {
	if (contextMenu.targetUser) {
		const space = inputText.endsWith(" ") || inputText === "" ? "" : " ";
		inputText += `${space}@${contextMenu.targetUser.name} `;
		inputRef?.focus();
	}
	contextMenu.show = false;
}

function handleWindowClick(e: MouseEvent) {
	if (contextMenu.show) contextMenu.show = false;

	const target = e.target as HTMLElement;
	if (!target.closest(".emoji-container-wrapper")) {
		showEmojiPicker = false;
	}
}

function handleMockAction() {
	showToast = true;
	if (toastTimeout) clearTimeout(toastTimeout);
	toastTimeout = setTimeout(() => {
		showToast = false;
	}, 3000);
}
</script>

<svelte:window onclick={handleWindowClick} />

<div
	class="fixed inset-0 z-[999] flex h-screen w-full overflow-hidden bg-[#313338] text-gray-200 font-sans selection:bg-[#5865F2] selection:text-white"
>
	{#if contextMenu.show && contextMenu.targetUser}
		<div
			class="fixed z-[1000] bg-[#111214] border border-[#1E1F22] rounded shadow-lg py-1 w-48 text-sm text-[#DBDEE1]"
			style="top: {contextMenu.y}px; left: {contextMenu.x}px;"
		>
			<button
				type="button"
				class="w-full text-left px-3 py-1.5 hover:bg-[#5865F2] hover:text-white transition-colors"
				onclick={handleContextMenuMention}
			>
				Mention @{contextMenu.targetUser.name}
			</button>
		</div>
	{/if}

	{#if showToast}
		<div
			transition:fade={{ duration: 150 }}
			class="absolute top-8 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-md bg-[#111214] px-4 py-3 text-sm font-medium text-white shadow-xl border border-[#1E1F22] z-[1000]"
		>
			<Info size={18} class="text-[#5865F2]" />
			{t.unavailableFeature}
		</div>
	{/if}

	<div class="flex w-[72px] flex-col items-center gap-2 overflow-y-auto bg-[#1E1F22] py-3 hide-scrollbar">
		<a
			href={`/task/${taskId}`}
			class="group relative flex h-12 w-12 items-center justify-center rounded-[24px] bg-[#313338] transition-all hover:rounded-[16px] overflow-hidden shadow-sm text-[#DBDEE1] hover:text-white hover:bg-[#DA373C]"
			title={t.returnTask}
		>
			<LogOut size={22} class="mr-0.5" />
		</a>
		<div class="h-[2px] w-8 rounded-full bg-[#35363C]"></div>
		<button type="button" class="relative flex h-12 w-12 items-center justify-center rounded-[16px] bg-[#5865F2] text-white transition-all">
			<div class="absolute -left-3 top-2 h-8 w-1 rounded-r-full bg-white"></div>
			<span class="text-sm font-medium">{serverAcronym}</span>
		</button>
		<button
			type="button"
			class="flex h-12 w-12 items-center justify-center rounded-[24px] bg-[#313338] text-[#23A559] transition-all hover:rounded-[16px] hover:bg-[#23A559] hover:text-white"
			onclick={handleMockAction}
		>
			<Plus size={24} />
		</button>
	</div>

	<div class="flex w-60 flex-col bg-[#2B2D31]">
		<button
			type="button"
			class="flex h-12 items-center justify-between border-b border-[#1F2023] px-4 font-semibold shadow-sm transition-colors hover:bg-[#35373C]"
			onclick={handleMockAction}
		>
			<span class="truncate">{serverName}</span>
			<ChevronDown size={18} />
		</button>
		<div class="flex-1 overflow-y-auto p-2 hide-scrollbar">
			<button
				type="button"
				class="w-full mb-1 mt-4 px-2 text-xs font-semibold text-[#949BA4] hover:text-gray-300 cursor-pointer flex justify-between items-center"
			>
				<span>{t.textChannels}</span>
				<Plus size={14} />
			</button>
			<button type="button" class="flex w-full items-center gap-1.5 rounded bg-[#404249] px-2 py-1.5 text-[#DBDEE1]">
				<Hash size={18} class="text-[#80848E]" />
				<span class="text-sm">{t.general}</span>
			</button>
		</div>

		<div class="flex h-[52px] items-center justify-between bg-[#232428] px-2">
			<button
				type="button"
				class="flex items-center gap-2 rounded px-2 py-1 hover:bg-[#35373C] w-full max-w-[140px] truncate"
				onclick={handleMockAction}
			>
				<div class="relative h-8 w-8 shrink-0">
					<div class="h-full w-full rounded-full bg-[#5865F2] overflow-hidden flex items-center justify-center font-bold text-white">
						{#if avatarUrl}
							<img src={avatarUrl} alt="User" class="h-full w-full object-cover">
						{:else}
							{userName.charAt(0).toUpperCase()}
						{/if}
					</div>
					<div class="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-[#232428] bg-[#23A559]"></div>
				</div>
				<div class="flex flex-col items-start text-sm truncate">
					<span class="font-semibold leading-tight text-white truncate w-full text-left">{userName}</span>
					<span class="text-xs text-[#949BA4]">{t.online}</span>
				</div>
			</button>
			<div class="flex gap-1 text-[#B5BAC1]">
				<button type="button" class="rounded p-1.5 hover:bg-[#35373C] hover:text-[#DBDEE1]" onclick={handleMockAction}><Mic size={18} /></button>
				<button type="button" class="rounded p-1.5 hover:bg-[#35373C] hover:text-[#DBDEE1]" onclick={handleMockAction}>
					<Headphones size={18} />
				</button>
				<button type="button" class="rounded p-1.5 hover:bg-[#35373C] hover:text-[#DBDEE1]" onclick={handleMockAction}><Settings size={18} /></button>
			</div>
		</div>
	</div>

	<div class="flex flex-1 flex-col bg-[#313338] min-w-0">
		<div class="flex h-12 shrink-0 items-center justify-between border-b border-[#1F2023] px-4 shadow-sm">
			<div class="flex items-center gap-2">
				<Hash size={24} class="text-[#80848E]" />
				<span class="font-semibold text-white">{t.general}</span>
			</div>
			<div class="flex items-center gap-4 text-[#B5BAC1]">
				{#if !isCompleted && sessionId}
					<button
						type="button"
						class="flex items-center gap-2 rounded bg-[#23A559] px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-[#1D8749] disabled:opacity-50"
						onclick={handleComplete}
						disabled={isCompleting ||
							isSubmitting ||
							isInitializing}
					>
						<CheckCircle size={16} />
						{isCompleting ? "Evaluating..." : "Finish Task"}
					</button>
				{/if}
				<button
					type="button"
					class="transition-colors {showMembers
						? 'text-white'
						: 'hover:text-[#DBDEE1]'}"
					onclick={() => (showMembers = !showMembers)}
				>
					<Users size={20} />
				</button>
			</div>
		</div>

		<div class="flex flex-1 overflow-hidden">
			<div class="flex flex-1 flex-col min-w-0 relative">
				<div bind:this={chatContainer} class="flex-1 overflow-y-auto px-4 py-6">
					<div class="my-4 mt-auto flex items-center justify-center">
						<div class="h-px flex-1 bg-[#404249]"></div>
						<span class="px-2 text-xs font-semibold text-[#949BA4]">{getTodayDateString()}</span>
						<div class="h-px flex-1 bg-[#404249]"></div>
					</div>

					{#each messages.filter((m) => !m.isHidden) as msg}
						<div class="mt-4 flex hover:bg-[#2E3035] p-1 -mx-4 px-4 rounded group">
							<div
								class="mr-4 mt-0.5 h-10 w-10 shrink-0 rounded-full {msg.role ===
								'agent'
									? msg.avatarColor
									: 'bg-[#5865F2]'} flex items-center justify-center text-white font-bold overflow-hidden"
							>
								{#if msg.role === "user" && msg.avatar}
									<img src={msg.avatar} alt="User Avatar" class="h-full w-full object-cover">
								{:else}
									{msg.authorName.charAt(0).toUpperCase()}
								{/if}
							</div>
							<div class="flex-1">
								<div class="flex items-baseline gap-2">
									<span class="font-medium text-white hover:underline cursor-pointer">{msg.authorName}</span>
									<span class="text-xs text-[#949BA4]">{msg.timestamp}</span>
								</div>
								<div class="text-[#DBDEE1] whitespace-pre-wrap">{msg.text}</div>
							</div>
						</div>
					{/each}

					{#if isInitializing || isSubmitting}
						<div class="mt-4 flex p-1 -mx-4 px-4 items-center gap-3">
							<div class="flex gap-1">
								<span class="w-2 h-2 rounded-full bg-[#80848E] animate-bounce"></span>
								<span class="w-2 h-2 rounded-full bg-[#80848E] animate-bounce" style="animation-delay: 0.2s"></span>
								<span class="w-2 h-2 rounded-full bg-[#80848E] animate-bounce" style="animation-delay: 0.4s"></span>
							</div>
							<span class="text-xs font-semibold text-[#80848E]">
								{isInitializing
									? "Agent is joining..."
									: `${agentUser.name} is typing...`}
							</span>
						</div>
					{/if}

					{#if isCompleted && feedback}
						<div class="mt-8 rounded-lg border border-[#1E1F22] bg-[#2B2D31] p-6 shadow-lg relative overflow-hidden">
							<div class="absolute top-0 left-0 w-1 h-full bg-[#FEE75C]"></div>
							<div class="flex items-center gap-2 mb-4 text-[#FEE75C]">
								<AlertCircle size={24} />
								<h3 class="text-lg font-bold">Tutor Evaluation</h3>
							</div>

							<p class="text-[#DBDEE1] mb-6 leading-relaxed whitespace-pre-wrap">{feedback.content}</p>

							<div class="space-y-3">
								<h4 class="text-sm font-semibold text-[#949BA4] uppercase tracking-wider">Objective Results</h4>
								{#each feedback.objectiveResults as obj}
									<div class="flex items-start justify-between rounded bg-[#1E1F22] p-3">
										<span class="text-sm text-[#DBDEE1] pr-4">{obj.text}</span>
										<span
											class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-sm font-bold {obj.grade ===
											'A'
												? 'bg-[#23A559] text-white'
												: obj.grade === 'B'
													? 'bg-[#FEE75C] text-black'
													: 'bg-[#DA373C] text-white'}"
										>
											{obj.grade}
										</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>

				<div class="px-4 pb-6 pt-1 shrink-0 relative">
					{#if showMentionMenu && filteredMentionUsers.length > 0}
						<div class="absolute bottom-[100%] left-4 mb-2 w-72 bg-[#2B2D31] border border-[#1E1F22] rounded shadow-xl overflow-hidden z-50">
							<div class="px-3 py-2 text-xs font-bold text-[#949BA4] uppercase bg-[#232428]">Members</div>
							<ul class="max-h-60 overflow-y-auto hide-scrollbar py-1">
								{#each filteredMentionUsers as user, i}
									<li class="mx-1">
										<button
											type="button"
											class="w-full text-left px-3 py-2 rounded hover:bg-[#35373C] cursor-pointer flex items-center gap-2 {mentionIndex ===
											i
												? 'bg-[#35373C]'
												: ''}"
											onmouseenter={() =>
												(mentionIndex = i)}
											onclick={() => insertMention(user)}
										>
											<div
												class="w-6 h-6 shrink-0 rounded-full {user.color} flex items-center justify-center text-xs font-bold text-white overflow-hidden"
											>
												{user.name.charAt(0)}
											</div>
											<span class="text-[#DBDEE1] text-sm font-medium">{user.name}</span>
											{#if user.isAgent}
												<span class="ml-auto text-[10px] bg-[#5865F2] text-white px-1.5 rounded font-bold uppercase tracking-wide">Bot</span>
											{/if}
										</button>
									</li>
								{/each}
							</ul>
						</div>
					{/if}

					<div
						class="flex items-center rounded-lg bg-[#383A40] px-4 py-2.5 {isCompleted
							? 'opacity-50 cursor-not-allowed'
							: ''}"
					>
						<button
							type="button"
							class="mr-4 rounded-full bg-[#B5BAC1] p-1 text-[#383A40] transition-colors hover:bg-[#DBDEE1]"
							onclick={handleMockAction}
						>
							<Plus size={16} strokeWidth={3} />
						</button>
						<input
							bind:this={inputRef}
							bind:value={inputText}
							oninput={handleInput}
							onkeydown={handleKeydown}
							disabled={isSubmitting ||
								isCompleting ||
								isCompleted ||
								isInitializing}
							type="text"
							placeholder={isCompleted
								? "Session ended"
								: isInitializing || isSubmitting
									? "Waiting..."
									: t.messagePlaceholder}
							class="flex-1 bg-transparent text-[#DBDEE1] outline-none placeholder:text-[#82868D] disabled:opacity-50"
						>
						<div class="flex gap-3 text-[#B5BAC1] relative emoji-container-wrapper">
							<button type="button" class="transition-colors hover:text-[#DBDEE1]" onclick={handleMockAction}><Gift size={22} /></button>
							<button type="button" class="transition-colors hover:text-[#DBDEE1]" onclick={handleMockAction}><Sticker size={22} /></button>

							{#if showEmojiPicker}
								<div
									class="absolute bottom-[100%] right-0 mb-4 w-72 bg-[#2B2D31] border border-[#1E1F22] rounded-lg shadow-xl overflow-hidden z-50 flex flex-col"
								>
									<div class="px-3 py-2 text-xs font-bold text-[#949BA4] uppercase bg-[#232428] border-b border-[#1E1F22]">Common Emojis</div>
									<div class="p-2 grid grid-cols-8 gap-1 max-h-60 overflow-y-auto hide-scrollbar">
										{#each COMMON_EMOJIS as emoji}
											<button
												type="button"
												class="h-8 w-8 flex items-center justify-center rounded hover:bg-[#35373C] transition-colors text-lg"
												onclick={(e) => {
													e.stopPropagation();
													insertEmoji(emoji);
												}}
											>
												{emoji}
											</button>
										{/each}
									</div>
								</div>
							{/if}

							<button
								type="button"
								class="transition-colors {showEmojiPicker
									? 'text-white'
									: 'hover:text-[#DBDEE1]'}"
								onclick={(e) => {
									e.stopPropagation();
									showEmojiPicker = !showEmojiPicker;
								}}
							>
								<Smile size={22} />
							</button>
						</div>
					</div>
				</div>
			</div>

			{#if showMembers}
				<div class="w-60 bg-[#2B2D31] shrink-0 flex flex-col hide-scrollbar overflow-y-auto px-2 py-4">
					<h3 class="px-2 pt-2 pb-1 text-[12px] font-semibold text-[#949BA4] uppercase">{t.online} — {onlineUsers.length + 2}</h3>

					<div class="flex items-center gap-3 px-2 py-1.5 hover:bg-[#35373C] rounded mt-0.5 opacity-100 transition-colors cursor-default">
						<div class="relative h-8 w-8 shrink-0">
							<div class="h-full w-full rounded-full bg-[#5865F2] overflow-hidden flex items-center justify-center font-bold text-white">
								{#if avatarUrl}
									<img src={avatarUrl} alt="User" class="h-full w-full object-cover">
								{:else}
									{userName.charAt(0).toUpperCase()}
								{/if}
							</div>
							<div class="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-[#2B2D31] bg-[#23A559]"></div>
						</div>
						<span class="text-[#DBDEE1] font-medium text-sm truncate">{userName} (You)</span>
					</div>

					<button
						type="button"
						class="flex items-center text-left gap-3 px-2 py-1.5 hover:bg-[#35373C] rounded cursor-pointer mt-0.5 opacity-100 transition-colors"
						oncontextmenu={(e) => handleContextMenu(e, agentUser)}
					>
						<div class="relative h-8 w-8 shrink-0">
							<div class="h-full w-full rounded-full {agentUser.color} overflow-hidden flex items-center justify-center font-bold text-white">
								{agentUser.name.charAt(0).toUpperCase()}
							</div>
							<div class="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-[#2B2D31] bg-[#23A559]"></div>
						</div>
						<div class="flex flex-col justify-center min-w-0">
							<div class="flex items-center gap-1">
								<span class="text-[#DBDEE1] font-medium text-sm truncate">{agentUser.name}</span>
								<span class="text-[9px] bg-[#5865F2] text-white px-1 rounded font-bold uppercase tracking-wide leading-tight">Bot</span>
							</div>
							<span class="text-xs text-[#B5BAC1] truncate">{agentUser.status}</span>
						</div>
					</button>

					{#each onlineUsers as user}
						<button
							type="button"
							class="flex items-center text-left gap-3 px-2 py-1.5 hover:bg-[#35373C] rounded cursor-pointer mt-0.5 opacity-100 transition-colors"
							oncontextmenu={(e) => handleContextMenu(e, user)}
						>
							<div class="relative h-8 w-8 shrink-0">
								<div class="h-full w-full rounded-full {user.color} overflow-hidden flex items-center justify-center font-bold text-white">
									{user.name.charAt(0).toUpperCase()}
								</div>
								<div class="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-[#2B2D31] bg-[#23A559]"></div>
							</div>
							<div class="flex flex-col justify-center min-w-0">
								<span class="text-[#DBDEE1] font-medium text-sm truncate">{user.name}</span>
								<span class="text-xs text-[#B5BAC1] truncate">{user.status}</span>
							</div>
						</button>
					{/each}

					<h3 class="px-2 pt-6 pb-1 text-[12px] font-semibold text-[#949BA4] uppercase">{t.offline} — {offlineUsers.length}</h3>

					{#each offlineUsers as user}
						<button
							type="button"
							class="flex items-center text-left gap-3 px-2 py-1.5 hover:bg-[#35373C] rounded cursor-pointer mt-0.5 opacity-50 hover:opacity-100 transition-all"
							oncontextmenu={(e) => handleContextMenu(e, user)}
						>
							<div class="relative h-8 w-8 shrink-0">
								<div class="h-full w-full rounded-full {user.color} overflow-hidden flex items-center justify-center font-bold text-white">
									{user.name.charAt(0).toUpperCase()}
								</div>
							</div>
							<span class="text-[#80848E] font-medium text-sm truncate">{user.name}</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
.hide-scrollbar::-webkit-scrollbar {
	display: none;
}
.hide-scrollbar {
	-ms-overflow-style: none;
	scrollbar-width: none;
}
</style>
