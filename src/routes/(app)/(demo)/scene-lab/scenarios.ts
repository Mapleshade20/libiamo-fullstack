import type { UiVariant } from "$lib/constants";
import type { ReferenceSpec } from "./references";

/** A scene to simulate: an inline task, a task from the local database by id, or a real conversation. */
export type Scenario = {
	id: string;
	label: string;
	taskId?: number;
	reference?: ReferenceSpec;
	task?: {
		title: string;
		language: string;
		ui: UiVariant;
		shortObjective: string;
		description: string;
		difficulty: number;
		agentPrompt: string;
		openingState: Record<string, unknown>;
	};
};

export const SCENARIOS: Scenario[] = [
	{
		id: "ref-reddit-aiban",
		label: "Real Reddit · UKGE bans AI art",
		reference: {
			file: "reddit-ai-ban.json",
			kind: "reddit",
			learner: "Rejusu",
			title: "Discuss a convention's AI-art ban",
			objective: "Say what you think of the ban and whether it can be enforced.",
			notes: "You play the people in this r/boardgames thread about UK Games Expo banning generative-AI art and text.",
		},
	},
	{
		id: "ref-reddit-never",
		label: "Real Reddit · the game nobody says yes to",
		reference: {
			file: "reddit-never-played.json",
			kind: "reddit",
			learner: "rivent2",
			title: "Share your game-night story",
			objective: "Tell the thread about a game your group never wants to play and how you handle game night.",
			notes: "You play the people in this r/boardgames thread swapping stories about games their groups refuse to play.",
		},
	},
	{
		id: "ref-reddit-warriors",
		label: "Real Reddit · Tallstar vs Crookedstar",
		reference: {
			file: "reddit-warriorcats.json",
			kind: "reddit",
			learner: "Fruitsdog",
			title: "Argue about Warriors characters",
			objective: "Say who had it worse, Tallstar or Crookedstar, and why.",
			notes: "You play the people in this r/WarriorCats thread arguing whether Tallstar or Crookedstar had the harder life.",
		},
	},
	{
		id: "ref-ao3",
		label: "Real AO3 · but I couldn't care for the history",
		reference: {
			file: "ao3-history.json",
			kind: "ao3",
			learner: "Kuki24",
			title: "Comment on a fan fic",
			objective: "Tell the author what you liked about the fic.",
			notes: "You play the author and the readers commenting on this Warriors fan fic.",
		},
	},
	{
		id: "ref-discord-cpl",
		label: "Real Discord · CPL suspension dispute",
		reference: {
			file: "discord-cpl.json",
			kind: "chat",
			learner: "Shadowz",
			title: "Ask about a league decision",
			objective: "Find out what the admins decided about a suspended community member and what happens next.",
			notes:
				"You play the people in #general-chat-civ6 of the CivPlayers League Discord. The admins suspended Herson, a popular Civ 6 YouTuber, and the channel is arguing about it. CanuckSoldier is the head admin.",
			serverName: "CivPlayers League",
			channelName: "general-chat-civ6",
		},
	},
	{
		id: "ref-irc-dn42",
		label: "Real IRC-as-Discord · DN42 vs the AI agent",
		reference: {
			file: "irc-dn42.json",
			kind: "chat",
			learner: "Lan Tian",
			title: "Chat about a strange registration",
			objective: "Join the channel's discussion of an AI agent that wants to scan the network.",
			notes: "You play the regulars of the DN42 community chat, network hobbyists reacting to an AI agent that asked to join the network to scan it.",
			serverName: "DN42",
			channelName: "dn42",
		},
	},
	{
		id: "discord-dm",
		label: "Discord DM · game night organiser",
		task: {
			title: "Join a community game night",
			language: "en",
			ui: "discord",
			shortObjective: "Ask the organiser if you can join Friday's game night and what you need to install.",
			description: "You saw an announcement for a community Among Us night and want to join.",
			difficulty: 1,
			agentPrompt:
				"You are velvetfox, who organises the Friday game nights of a small indie-games Discord. You run them for fun, are a bit disorganised, and are happy about new people but not gushing. Friday starts 8pm UTC; people need Among Us on PC and a working mic. Last week only four people showed up.",
			openingState: { dm: true, counterpartName: "velvetfox", previousMessages: [] },
		},
	},
	{
		id: "imessage-group",
		label: "iMessage group · Lisbon trip",
		task: {
			title: "Plan a trip with friends",
			language: "en",
			ui: "imessage",
			shortObjective: "Agree with your friends on where to stay in Lisbon and say what you can afford.",
			description: "Your friends are planning a long weekend in Lisbon in May. The group chat is already arguing.",
			difficulty: 2,
			agentPrompt:
				"You play the friends in this group chat. Priya is organising and wants decisions made. Tom keeps joking and hasn't checked his calendar. Jess is on a tight budget and hates hostels less than everyone thinks.",
			openingState: {
				groupName: "Lisbon 🇵🇹",
				counterpartName: "Priya",
				members: "Tom, Jess",
				previousMessages: [
					{ sender: "Priya", text: "ok we NEED to book this week or prices go up" },
					{ sender: "Priya", text: "airbnb in alfama is 140/night for all of us, hostel private room is 90" },
					{ sender: "Tom", text: "140 split 4 ways is like a coffee" },
					{ sender: "Jess", text: "it's 35 each per night tom. times 3 nights" },
					{ sender: "Tom", text: "an expensive coffee" },
				],
			},
		},
	},
	{ id: "imessage-dm", label: "iMessage · weekend plans (task 7)", taskId: 7 },
	{
		id: "mail-group",
		label: "Mail group · team offsite",
		task: {
			title: "Answer a team email thread",
			language: "en",
			ui: "apple_mail",
			shortObjective: "Reply to the offsite thread with your availability and a venue preference, and offer to help with one thing.",
			description: "You joined the team two weeks ago. Your lead started a thread about the Q3 offsite.",
			difficulty: 2,
			agentPrompt:
				"You play the people on this email thread. Hannah Lee leads the team and wants a date fixed by Friday. Marco Ruiz handles the budget and prefers the cheaper venue. Dana Whitfield is a designer who is away on the 12th and a little annoyed that offsites always land on Fridays.",
			openingState: {
				counterpartName: "Hannah Lee <hannah.lee@northwind.example>",
				members: "Marco Ruiz <marco.ruiz@northwind.example>, Dana Whitfield <dana.w@northwind.example>",
				emails: [
					{
						from: "Hannah Lee <hannah.lee@northwind.example>",
						to: "Team",
						subject: "Q3 offsite: date & venue",
						time: "Mon 9:12",
						body: "Hi all,\n\nTime to lock in the Q3 offsite. Options:\n- Fri 12 Sept or Fri 19 Sept\n- The Boathouse (lake, €2,400) or the Foundry (city, €1,500)\n\nReply-all with what works. I'd like to decide by Friday.\n\nThanks,\nHannah",
					},
					{
						from: "Marco Ruiz <marco.ruiz@northwind.example>",
						to: "Team",
						subject: "Re: Q3 offsite: date & venue",
						time: "Mon 10:40",
						body: "The Foundry, please. We're already over on travel this quarter.\n\nM.",
					},
					{
						from: "Dana Whitfield <dana.w@northwind.example>",
						to: "Team",
						subject: "Re: Q3 offsite: date & venue",
						time: "Mon 11:02",
						body: "I'm out on the 12th, so the 19th for me. Also, could we do a Thursday for once?\n\nDana",
					},
				],
			},
		},
	},
	{ id: "mail-dm", label: "Mail · fishing charter (task 9)", taskId: 9 },
	{ id: "es-reddit", label: "Reddit (es) · CDMX tips (task 8)", taskId: 8 },
	{ id: "es-discord", label: "Discord (es) · Minecraft speedrun (task 6)", taskId: 6 },
	{
		id: "ja-discord",
		label: "Discord (ja) · モンハン雑談",
		task: {
			title: "ゲームサーバーの雑談に参加する",
			language: "ja",
			ui: "discord",
			shortObjective: "雑談チャンネルで、今週末いっしょに狩りに行ける人がいるか聞いてみる。",
			description: "モンハンのファンサーバーに最近入った。雑談チャンネルでは常連がアップデートの話をしている。",
			difficulty: 2,
			agentPrompt:
				"雑談チャンネルの常連たち。ささみは古参で面倒見がいいが、ソロ派。ぽんずはアプデ情報に詳しく、ちょっと皮肉屋。くろは夜しかいない大学生で、誘われると乗りやすい。",
			openingState: {
				serverName: "モンハン部",
				channelName: "雑談",
				previousMessages: [
					{ sender: "ぽんず", text: "アプデ来たけど新モンスの肉質えぐくない？" },
					{ sender: "ささみ", text: "ハンマーだと頭ほぼ通らんね" },
					{ sender: "くろ", text: "昨日3乙したわ笑" },
					{ sender: "ぽんず", text: "くろはいつも3乙してる" },
					{ sender: "くろ", text: "それはそう" },
				],
			},
		},
	},
];
