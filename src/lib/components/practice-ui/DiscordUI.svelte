<script lang="ts">
import Bell from "@lucide/svelte/icons/bell";
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

interface Props {
	taskId?: string | number;
	userName?: string;
	avatarUrl?: string;
	language?: string;
	agentPrompt?: string;
}

let { taskId = "", userName = "Learner", avatarUrl = "", language = "en", agentPrompt = "" }: Props = $props();

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
};

type Member = {
	id: string;
	name: string;
	sub?: string;
	color: string;
};

let messages = $state<Message[]>([]);
let inputText = $state("");
let chatContainer: HTMLElement;
let showToast = $state(false);
let toastTimeout: ReturnType<typeof setTimeout>;
let showMembers = $state(false);

let mockOnlineMembers = $state<Member[]>([]);
let mockOfflineMembers = $state<Member[]>([]);

const namePool = [
	"Alex",
	"ShadowHunter",
	"btq",
	"caticy",
	"Dr_Vah",
	"En_Taro_Artanis!",
	"D1Amond",
	"cyberkiana",
	"Kael",
	"Nova",
	"Zeus",
	"xX_Slayer_Xx",
	"SilentWolf",
	"PixelPirate",
	"LunaStar",
	"ThunderBolt99",
	"FrostByte",
	"SirReginald",
	"ChaoticNeutral",
	"NeonViper",
	"Echo_419",
	"BlazeRunner",
	"MysticMango",
	"Deadpool_Actual",
	"NiteOwl",
	"GhostRecon_01",
	"Vex",
	"Zephyr",
	"OrionPax",
	"RogueAgent",
	"StaticShock",
	"Cptn_Crunch",
	"Sapphire_7",
	"Omega_Zero",
	"SneakyBeaky",
	"DrDisRespectful",
	"TacticalTaco",
	"Aether",
	"JadeRabbit",
	"Kodiak",
	"NoobMaster69",
	"BluePhoenix",
	"Valkyrie_V",
	"OnyxWraith",
	"lIlIlIlIlI",
	"TiltedTowers",
	"SweatySpartan",
	"B1gChungus",
	"S0m3_Guy",
	"Iron_Mouse",
	"CyberPunk_2077",
	"Major_Decibel",
	"FlatEarther420",
	"BananaStand",
	"ActuallyViolet",
	"TheDude_Abides",
	"BingChilling",
	"Glitch_Mob",
	"r3d_r0ck3t",
	"Soap_Mactavish",
	"Phantom_Requiem",
	"M1nd_Gam3z",
	"WubbaLubbaDubDub",
	"OhCaptainMyCaptain",
	"xX_NotABot_Xx",
	"Y33t_Cannon",
];

const statusPool = [
	"Playing Valorant",
	"Listening to Spotify",
	"Coding in Svelte",
	"Idle",
	"Playing Fortnite",
	"Playing Call of Duty: Warzone",
	"In Queue - Competitive",
	"AFK",
	"Away",
	"Do Not Disturb",
	"Watching YouTube",
	"Watching Twitch",
	"Listening to Lo-Fi Beats",
	"Listening to Podcast",
	"Coding in VS Code",
	"Debugging...",
	"In a Meeting (Pretending)",
	"Working from Home",
	"Eating Dinner",
	"Touching Grass",
	"Sleeping (Offline)",
	"Playing Apex Legends",
	"Playing Rocket League",
	"Browsing Reddit",
	"Scrolling Twitter",
	"Watching Netflix",
	"Chilling in Discord",
	"In Lobby",
	"Looking for Group",
	"Solo Queue Hell",
	"Streaming Live!",
	"Be Right Back",
	"Invisible",
	"Online",
	"Offline",
	"Away from Keyboard",
	"Gaming 🎮",
	"Studying 📚",
	"At the Gym 💪",
	"Drinking Coffee ☕",
	"Existential Crisis",
];

const colorPool = [
	"bg-red-600",
	"bg-blue-600",
	"bg-green-600",
	"bg-amber-600",
	"bg-purple-600",
	"bg-pink-600",
	"bg-indigo-600",
	"bg-teal-600",
	"bg-rose-600",
];

// Generate random users on mount (to avoid SSR hydration mismatches)
onMount(() => {
	// Shuffle the name pool to avoid duplicates
	const shuffledNames = [...namePool].sort(() => 0.5 - Math.random());

	// Randomly decide counts (Max 3 online excluding current user)
	const onlineCount = Math.floor(Math.random() * 4); // 0 to 3
	const offlineCount = Math.floor(Math.random() * 6) + 5; // 5 to 10

	const generatedOnline: Member[] = [];
	for (let i = 0; i < onlineCount; i++) {
		generatedOnline.push({
			id: crypto.randomUUID(),
			name: shuffledNames.pop() || "User",
			sub: statusPool[Math.floor(Math.random() * statusPool.length)],
			color: colorPool[Math.floor(Math.random() * colorPool.length)],
		});
	}
	mockOnlineMembers = generatedOnline;

	const generatedOffline: Member[] = [];
	for (let i = 0; i < offlineCount; i++) {
		generatedOffline.push({
			id: crypto.randomUUID(),
			name: shuffledNames.pop() || "User",
			color: colorPool[Math.floor(Math.random() * colorPool.length)],
		});
	}
	mockOfflineMembers = generatedOffline;
});

async function scrollToBottom() {
	await tick();
	if (chatContainer) {
		chatContainer.scrollTop = chatContainer.scrollHeight;
	}
}

function formatTime(date: Date) {
	return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getTodayDateString() {
	return new Intl.DateTimeFormat(language === "en" ? "en-US" : language, {
		year: "numeric",
		month: "long",
		day: "numeric",
	}).format(new Date());
}

async function handleSend() {
	if (!inputText.trim()) return;

	const currentText = inputText;

	// 1. Append user message
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

	inputText = "";
	await scrollToBottom();

	const historyForAPI = messages
		.slice(0, -1)
		.map((msg) => ({
			role: msg.role === "user" ? "user" : "assistant",
			content: msg.text,
		}))
		.slice(-10);

	// 2. LLM integration
	if (mockOnlineMembers.length > 0) {
		// Loop through each online member and simulate a delayed response
		mockOnlineMembers.forEach((member, index) => {
			// Stagger the responses so they don't appear at the exact same millisecond
			const delay = 1000 + index * 800;

			setTimeout(async () => {
				try {
					// Combine the database agentPrompt with the Discord persona wrapper
					const baseInstruction = agentPrompt || `You are helping the user practice ${language}.`;
					const systemPrompt = `[CORE INSTRUCTIONS]\n${baseInstruction}\n\n[ROLEPLAY CONTEXT]\nYou are a Discord user named ${member.name}. Your current status is: ${member.sub || "Online"}. Keep your response casual, conversational, short, and natural for a Discord chat room. Use emojis occasionally.`;

					const response = await fetch("/api/chat", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							userMessage: currentText,
							history: historyForAPI,
							systemPrompt: systemPrompt,
						}),
					});

					if (response.ok) {
						const data = await response.json();
						messages = [
							...messages,
							{
								id: crypto.randomUUID(),
								role: "agent",
								text: data.reply.content,
								timestamp: formatTime(new Date()),
								authorName: member.name,
								avatarColor: member.color,
							},
						];
						await scrollToBottom();
					}
				} catch (error) {
					console.error(`Failed to get LLM response for ${member.name}:`, error);
				}
			}, delay);
		});
	} else {
		// Fallback
		setTimeout(async () => {
			try {
				// System bot doesn't need the DB prompt, it just notifies the user
				const systemPrompt = `You are System Bot. Inform the user in ${language} that no other users are currently online to reply.`;

				const response = await fetch("/api/chat", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						userMessage: currentText,
						history: historyForAPI,
						systemPrompt: systemPrompt,
					}),
				});

				if (response.ok) {
					const data = await response.json();
					messages = [
						...messages,
						{
							id: crypto.randomUUID(),
							role: "agent",
							text: data.reply.content,
							timestamp: formatTime(new Date()),
							authorName: "System Bot",
							avatarColor: "bg-[#5865F2]",
						},
					];
					await scrollToBottom();
				}
			} catch (error) {
				console.error("System Bot fallback error:", error);
			}
		}, 1000);
	}
}

function handleKeydown(e: KeyboardEvent) {
	if (e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		handleSend();
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

<div
	class="fixed inset-0 z-[999] flex h-screen w-full overflow-hidden bg-[#313338] text-gray-200 font-sans selection:bg-[#5865F2] selection:text-white"
>
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
			<button
				type="button"
				class="w-full mb-1 mt-6 px-2 text-xs font-semibold text-[#949BA4] hover:text-gray-300 cursor-pointer flex justify-between items-center"
				onclick={handleMockAction}
			>
				<span>{t.voiceChannels}</span>
				<Plus size={14} />
			</button>
			<button
				type="button"
				class="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-[#949BA4] hover:bg-[#35373C] hover:text-[#DBDEE1]"
				onclick={handleMockAction}
			>
				<div class="relative">
					<Hash size={18} />
					<Mic size={10} class="absolute -bottom-0.5 -right-0.5" />
				</div>
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
				<button type="button" class="hover:text-[#DBDEE1]" onclick={handleMockAction}><Hash size={20} /></button>
				<button type="button" class="hover:text-[#DBDEE1]" onclick={handleMockAction}><Bell size={20} /></button>
				<button type="button" class="hover:text-[#DBDEE1]" onclick={handleMockAction}><Pin size={20} /></button>
				<button
					type="button"
					class="transition-colors {showMembers ? 'text-white' : 'hover:text-[#DBDEE1]'}"
					onclick={() => (showMembers = !showMembers)}
				>
					<Users size={20} />
				</button>
			</div>
		</div>

		<div class="flex flex-1 overflow-hidden">
			<div class="flex flex-1 flex-col min-w-0">
				<div bind:this={chatContainer} class="flex-1 overflow-y-auto px-4 py-6">
					<div class="my-4 mt-auto flex items-center justify-center">
						<div class="h-px flex-1 bg-[#404249]"></div>
						<span class="px-2 text-xs font-semibold text-[#949BA4]">{getTodayDateString()}</span>
						<div class="h-px flex-1 bg-[#404249]"></div>
					</div>
					{#each messages as msg}
						<div class="mt-4 flex hover:bg-[#2E3035] p-1 -mx-4 px-4 rounded group">
							<div
								class="mr-4 mt-0.5 h-10 w-10 shrink-0 rounded-full {msg.role === 'agent' ? msg.avatarColor : 'bg-[#5865F2]'} flex items-center justify-center text-white font-bold overflow-hidden"
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
				</div>

				<div class="px-4 pb-6 pt-1 shrink-0">
					<div class="flex items-center rounded-lg bg-[#383A40] px-4 py-2.5">
						<button
							type="button"
							class="mr-4 rounded-full bg-[#B5BAC1] p-1 text-[#383A40] transition-colors hover:bg-[#DBDEE1]"
							onclick={handleMockAction}
						>
							<Plus size={16} strokeWidth={3} />
						</button>
						<input
							bind:value={inputText}
							onkeydown={handleKeydown}
							type="text"
							placeholder={t.messagePlaceholder}
							class="flex-1 bg-transparent text-[#DBDEE1] outline-none placeholder:text-[#82868D]"
						>
						<div class="flex gap-3 text-[#B5BAC1]">
							<button type="button" class="transition-colors hover:text-[#DBDEE1]" onclick={handleMockAction}><Gift size={22} /></button>
							<button type="button" class="transition-colors hover:text-[#DBDEE1]" onclick={handleMockAction}><Sticker size={22} /></button>
							<button type="button" class="transition-colors hover:text-[#DBDEE1]" onclick={handleMockAction}><Smile size={22} /></button>
						</div>
					</div>
				</div>
			</div>

			{#if showMembers}
				<div class="w-60 bg-[#2B2D31] shrink-0 flex flex-col hide-scrollbar overflow-y-auto px-2 py-4">
					<h3 class="px-2 pt-2 pb-1 text-[12px] font-semibold text-[#949BA4] uppercase">{t.online} - {mockOnlineMembers.length + 1}</h3>
					<div class="flex items-center gap-3 px-2 py-1.5 hover:bg-[#35373C] rounded cursor-pointer mt-0.5 opacity-100 transition-colors">
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
						<span class="text-[#DBDEE1] font-medium text-sm truncate">{userName}</span>
					</div>
					{#each mockOnlineMembers as member}
						<div class="flex items-center gap-3 px-2 py-1.5 hover:bg-[#35373C] rounded cursor-pointer mt-0.5 opacity-100 transition-colors">
							<div class="relative h-8 w-8 shrink-0">
								<div class="h-full w-full rounded-full {member.color} overflow-hidden flex items-center justify-center font-bold text-white">
									{member.name.charAt(0).toUpperCase()}
								</div>
								<div class="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-[#2B2D31] bg-[#23A559]"></div>
							</div>
							<div class="flex flex-col justify-center min-w-0">
								<span class="text-[#DBDEE1] font-medium text-sm truncate">{member.name}</span>
								{#if member.sub}
									<span class="text-xs text-[#B5BAC1] truncate">{member.sub}</span>
								{/if}
							</div>
						</div>
					{/each}
					<h3 class="px-2 pt-6 pb-1 text-[12px] font-semibold text-[#949BA4] uppercase">{t.offline} - {mockOfflineMembers.length}</h3>
					{#each mockOfflineMembers as member}
						<div
							class="flex items-center gap-3 px-2 py-1.5 hover:bg-[#35373C] rounded cursor-pointer mt-0.5 opacity-50 hover:opacity-100 transition-all"
						>
							<div class="relative h-8 w-8 shrink-0">
								<div class="h-full w-full rounded-full {member.color} overflow-hidden flex items-center justify-center font-bold text-white">
									{member.name.charAt(0).toUpperCase()}
								</div>
							</div>
							<span class="text-[#80848E] font-medium text-sm truncate">{member.name}</span>
						</div>
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
