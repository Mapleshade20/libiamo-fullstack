import { describe, expect, it } from "vitest";
import { resolveScene } from "$lib/practice/scene";
import { drawSceneMoment, sendsBursts } from "$lib/server/practice/agent-replies/floor";
import type { TranscriptEntry } from "$lib/server/practice/prompt-context";

const scene = resolveScene(
	"reddit",
	{
		post: { author: "op" },
		previousComments: [
			{ author: "alex", text: "x" },
			{ author: "luma", text: "y" },
		],
	},
	1,
	"Maple",
);

const learner = (id: number, replyTo?: number, text = "hm"): TranscriptEntry => ({
	id,
	role: "learner",
	author: "Maple",
	text,
	...(replyTo ? { replyTo } : {}),
});
const cast = (id: number, author: string, replyTo?: number): TranscriptEntry => ({
	id,
	role: "cast",
	author,
	text: "ok",
	...(replyTo ? { replyTo } : {}),
});

describe("the floor of a group scene", () => {
	const answering = (moment: ReturnType<typeof drawSceneMoment>, id: number) =>
		moment?.around.filter((person) => person.does.startsWith(`answers #${id} `)) ?? [];

	it("always has someone answer the learner, and never more than one stranger", () => {
		for (let seed = 0; seed < 60; seed += 1) {
			const moment = drawSceneMoment({ ui: "reddit", language: "en", entries: [cast(1, "alex"), learner(2, 1)], scene, learnerName: "Maple", seed });
			const answers = answering(moment, 2);
			expect(answers.length).toBeGreaterThan(0);
			expect(answers.filter((person) => person.name !== "alex" && person.name !== "op").length).toBeLessThanOrEqual(1);
		}
	});

	it("has the person a Discord reply quotes answer it, not whoever spoke last", () => {
		const channel = resolveScene(
			"discord",
			{
				channelName: "general",
				previousMessages: [
					{ sender: "rin", text: "a" },
					{ sender: "kai", text: "b" },
					{ sender: "theo", text: "c" },
				],
			},
			1,
			"Maple",
		);
		const entries = [cast(1, "rin"), cast(2, "kai"), cast(3, "theo"), learner(4, 1)];
		const answered = Array.from({ length: 40 }, (_, seed) =>
			answering(drawSceneMoment({ ui: "discord", language: "en", entries, scene: channel, learnerName: "Maple", seed }), 4).map((p) => p.name),
		);
		const count = (name: string) => answered.filter((names) => names.includes(name)).length;
		expect(count("rin")).toBeGreaterThan(20);
		expect(count("rin")).toBeGreaterThan(2 * Math.max(count("kai"), count("theo")));
	});

	it("lets inferred addressees stand in for names in the text", () => {
		const entries = [cast(1, "alex"), cast(2, "luma"), learner(3, undefined, "alex is right")];
		const answered = (addressees: string[] | null) =>
			Array.from({ length: 40 }, (_, seed) =>
				answering(drawSceneMoment({ ui: "reddit", language: "en", entries, scene, learnerName: "Maple", seed, addressees }), 3).map((p) => p.name),
			).filter((names) => names.includes("luma")).length;
		// Naming alex no longer pulls alex in once luma is the one inferred.
		expect(answered(["luma"])).toBeGreaterThan(answered(null));
	});

	it("steps back someone who has been the learner's only partner", () => {
		const entries = [learner(1), cast(2, "alex", 1), learner(3, 2), cast(4, "alex", 3), learner(5, 4)];
		const draws = Array.from({ length: 40 }, (_, seed) =>
			drawSceneMoment({ ui: "reddit", language: "en", entries, scene, learnerName: "Maple", seed }),
		);
		expect(draws[0]?.notes.some((note) => note.includes("alex has been Maple's only partner"))).toBe(true);
		const alex = draws.filter((moment) => answering(moment, 5).some((person) => person.name === "alex")).length;
		expect(alex).toBeGreaterThan(0);
		expect(alex).toBeLessThan(40);
	});

	it("keeps readers of a fan work from arguing, and has the author answer comments on it", () => {
		// "omg" is also a reader's name, but saying it does not call them.
		const work = resolveScene("ao3", { authorName: "solace", previousComments: [{ username: "omg", comment: "loved it" }] }, 1, "Maple");
		const moments = Array.from({ length: 40 }, (_, seed) =>
			drawSceneMoment({
				ui: "ao3",
				language: "en",
				entries: [cast(1, "omg"), learner(2, undefined, "this made me cry omg")],
				scene: work,
				learnerName: "Maple",
				seed,
			}),
		);
		expect(moments.filter((moment) => answering(moment, 2).some((person) => person.name === "solace")).length).toBeGreaterThan(30);
		expect(moments.flatMap((moment) => moment?.around ?? []).some((person) => /push|disagree|nitpick/.test(person.attitude ?? ""))).toBe(false);
	});

	it("tells the cast when the learner asked the whole room, in any script", () => {
		for (const text of ["anyone tried it?", "誰か行ける？", "who's in? 😅"]) {
			const moment = drawSceneMoment({ ui: "reddit", language: "en", entries: [learner(1, undefined, text)], scene, learnerName: "Maple", seed: 3 });
			expect(moment?.notes.some((note) => note.includes("#1 is to everyone"))).toBe(true);
		}
	});

	it("favours whoever just talked with the learner in a chat", () => {
		const room = resolveScene("discord", { previousMessages: ["a", "b", "c"].map((sender) => ({ sender, text: "hi" })) }, 1, "Maple");
		const entries = [cast(1, "a"), cast(2, "b"), cast(3, "c"), learner(4), cast(5, "b"), learner(6)];
		const answers = (name: string) =>
			Array.from({ length: 60 }, (_, seed) =>
				drawSceneMoment({ ui: "discord", language: "en", entries, scene: room, learnerName: "Maple", seed }),
			).filter((moment) => moment?.around.some((person) => person.name === name && person.does.startsWith("answers #6"))).length;
		expect(answers("b")).toBeGreaterThan(answers("c"));
	});

	it("lets group members who have not spoken yet join in, when answering the learner and when time passes", () => {
		const group = resolveScene(
			"imessage",
			{ counterpartName: "Alice", members: "Bob, Carol", previousMessages: [{ sender: "Alice", text: "hi" }] },
			1,
			"Maple",
		);
		const speakers = (entries: TranscriptEntry[]) =>
			new Set(
				Array.from({ length: 60 }, (_, seed) =>
					drawSceneMoment({ ui: "imessage", language: "en", entries, scene: group, learnerName: "Maple", seed }),
				).flatMap((moment) => moment?.around.map((person) => person.name) ?? []),
			);
		expect(speakers([cast(1, "Alice"), learner(2, undefined, "Any ideas, everyone?")])).toEqual(new Set(["Alice", "Bob", "Carol"]));
		expect(speakers([cast(1, "Alice"), learner(2), cast(3, "Alice")])).toEqual(new Set(["Alice", "Bob", "Carol"]));
	});

	it("lets time pass in a thread without reviving branches away from the learner", () => {
		const entries = [cast(1, "alex"), cast(2, "luma"), cast(3, "alex", 2), learner(4, 1), cast(5, "alex", 4)];
		for (let seed = 0; seed < 30; seed += 1) {
			for (const person of drawSceneMoment({ ui: "reddit", language: "en", entries, scene, learnerName: "Maple", seed })?.around ?? [])
				expect(person.does).not.toMatch(/#[23]\b/);
		}
	});
});

describe("anchored floors", () => {
	const channel = resolveScene(
		"discord",
		{
			counterpartName: "kiwi",
			previousMessages: [
				{ sender: "zote", text: "a" },
				{ sender: "zote", text: "b" },
				{ sender: "grub", text: "c" },
			],
		},
		1,
		"Maple",
	);
	const entries: TranscriptEntry[] = [
		{ id: 1, opening: true, role: "cast", author: "zote", text: "a" },
		{ id: 2, opening: true, role: "cast", author: "zote", text: "b" },
		{ id: 3, opening: true, role: "cast", author: "grub", text: "c" },
		learner(4, undefined, "hey @zote @grub @kiwi"),
	];

	it("lets people who already posted keep their own voice instead of a drawn habit", () => {
		for (let seed = 0; seed < 20; seed += 1) {
			for (const person of drawSceneMoment({ ui: "discord", language: "en", entries, scene: channel, learnerName: "Maple", seed })?.around ?? []) {
				if (person.name === "zote" || person.name === "grub") expect(person.habits).toBeUndefined();
			}
		}
	});

	it("has people send bursts in chats when they already did, never on threads", () => {
		expect(sendsBursts("discord", "zote", entries)).toBe(true);
		expect(sendsBursts("reddit", "zote", entries)).toBe(false);
	});
});
