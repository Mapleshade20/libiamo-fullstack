import { describe, expect, it } from "vitest";
import { resolveScene } from "$lib/practice/scene";
import { allocateParticipants, drawSceneMoment, drawTakerCount, sendsBursts } from "$lib/server/practice/agent-replies/floor";
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

describe("taker counts and allocation", () => {
	it("draws a taker count deterministically from the seed, within the platform's range", () => {
		expect(drawTakerCount("reddit", 11)).toBe(drawTakerCount("reddit", 11));
		const counts = new Set(Array.from({ length: 60 }, (_, seed) => drawTakerCount("reddit", seed)));
		expect(counts.size).toBeGreaterThan(1);
		for (const count of counts) {
			expect(count).toBeGreaterThanOrEqual(1);
			expect(count).toBeLessThanOrEqual(3);
		}
	});

	it("allocates distinct participants, never the learner, within the requested count", () => {
		const entries = [cast(1, "alex"), cast(2, "luma"), learner(3, 1)];
		for (let seed = 0; seed < 40; seed += 1) {
			const participants = allocateParticipants({
				ui: "reddit",
				language: "en",
				entries,
				scene,
				learnerName: "Maple",
				seed,
				count: 3,
				target: entries[2],
			});
			expect(participants.length).toBeLessThanOrEqual(3);
			expect(new Set(participants).size).toBe(participants.length);
			expect(participants).not.toContain("Maple");
		}
	});

	it("makes a regular introduced in a nested opening exchange eligible for a top-level question", () => {
		const nested = resolveScene(
			"reddit",
			{ post: { author: "op" }, previousComments: [{ author: "asker", text: "help?", replies: [{ author: "regular", text: "I know this" }] }] },
			1,
			"Maple",
		);
		const entries: TranscriptEntry[] = [
			{ id: 1, opening: true, role: "cast", author: "asker", text: "help?" },
			{ id: 2, opening: true, role: "cast", author: "regular", text: "I know this", replyTo: 1 },
			learner(3, undefined, "anyone know?"),
		];
		const drawn = new Set(
			Array.from({ length: 60 }, (_, seed) =>
				allocateParticipants({ ui: "reddit", language: "en", entries, scene: nested, learnerName: "Maple", seed, count: 2, target: entries[2] }),
			).flat(),
		);
		expect(drawn).toContain("regular");
	});

	it("keeps excluded participants out of a retry's draw and always returns the counterpart one-to-one", () => {
		const entries = [cast(1, "alex"), learner(2, 1)];
		for (let seed = 0; seed < 40; seed += 1) {
			expect(
				allocateParticipants({
					ui: "reddit",
					language: "en",
					entries,
					scene,
					learnerName: "Maple",
					seed,
					count: 2,
					target: entries[1],
					exclude: ["alex"],
				}),
			).not.toContain("alex");
		}
		const duet = resolveScene("apple_mail", { counterpartName: "Maya <maya@x.example>", emails: [] }, 1, "Maple");
		expect(
			allocateParticipants({
				ui: "apple_mail",
				language: "en",
				entries: [],
				scene: duet,
				learnerName: "Maple",
				seed: 1,
				count: 3,
				target: learner(1),
			}),
		).toEqual(["Maya"]);
	});

	it("keeps sibling sub-thread authors out of a branch reply's allocation", () => {
		// Root comment with children A (alex) and B (bob); the learner answered A, so bob — who
		// only spoke in the sibling branch — is not nearby for this exchange, and neither is luma,
		// whose top-level comment is a different conversation entirely, while the addressed alex
		// and the owner keep their own reasons to take it up.
		const entries: TranscriptEntry[] = [
			{ id: 1, role: "cast", author: "op", text: "root" },
			{ id: 2, role: "cast", author: "alex", text: "A", replyTo: 1 },
			{ id: 3, role: "cast", author: "bob", text: "B", replyTo: 1 },
			{ id: 5, role: "cast", author: "luma", text: "Another top-level branch" },
			learner(4, 2),
		];
		for (let seed = 0; seed < 60; seed += 1) {
			const participants = allocateParticipants({
				ui: "reddit",
				language: "en",
				entries,
				scene,
				learnerName: "Maple",
				seed,
				count: 3,
				target: entries[4],
			});
			expect(participants.length).toBeGreaterThan(0);
			expect(participants).not.toContain("bob");
			expect(participants).not.toContain("luma");
		}
	});
});

describe("async take-up moments", () => {
	it("lists exactly the fixed participant, keyed on the target entry rather than the newest learner message", () => {
		const entries = [learner(1, undefined, "anyone?"), learner(3, undefined, "a separate question")];
		const moment = drawSceneMoment({
			ui: "reddit",
			language: "en",
			entries,
			scene,
			learnerName: "Maple",
			seed: 5,
			participant: "luma",
			target: entries[0],
		});
		expect(moment?.around).toHaveLength(1);
		expect(moment?.around[0]).toMatchObject({ name: "luma", does: "answers #1 (Maple)" });
	});

	it("can pick up a landed cast answer in the target's conversation instead (dependent continuation)", () => {
		const entries = [learner(1, undefined, "anyone?"), cast(2, "alex", 1)];
		const does = new Set(
			Array.from(
				{ length: 30 },
				(_, seed) =>
					drawSceneMoment({ ui: "reddit", language: "en", entries, scene, learnerName: "Maple", seed, participant: "luma", target: entries[0] })
						?.around[0].does,
			),
		);
		expect(does).toContain("answers #2");
		expect(does).toContain("answers #1 (Maple)");
	});

	it("never picks up a sibling sub-thread under the same root", () => {
		// Root comment with children A and B; the learner answered A, so only the learner's own
		// exchange — the target and what answers it — is answerable, never the sibling B.
		const entries: TranscriptEntry[] = [
			{ id: 1, role: "cast", author: "op", text: "root" },
			{ id: 2, role: "cast", author: "alex", text: "A", replyTo: 1 },
			{ id: 3, role: "cast", author: "luma", text: "B", replyTo: 1 },
			learner(4, 2),
		];
		const does = new Set(
			Array.from(
				{ length: 40 },
				(_, seed) =>
					drawSceneMoment({ ui: "reddit", language: "en", entries, scene, learnerName: "Maple", seed, participant: "op", target: entries[3] })
						?.around[0].does,
			),
		);
		expect([...does]).toEqual(["answers #4 (Maple)"]);

		// A cast answer inside the learner's exchange is a fair target; the sibling still never is.
		const withAnswer = [...entries, cast(5, "alex", 4)];
		const answered = new Set(
			Array.from(
				{ length: 40 },
				(_, seed) =>
					drawSceneMoment({
						ui: "reddit",
						language: "en",
						entries: withAnswer,
						scene,
						learnerName: "Maple",
						seed,
						participant: "op",
						target: withAnswer[3],
					})?.around[0].does,
			),
		);
		expect(answered).toContain("answers #5");
		expect([...answered].every((line) => line !== "answers #2" && line !== "answers #3")).toBe(true);
	});

	it("draws a world moment from recent cast messages anywhere in the thread, unpicked questions included", () => {
		const entries: TranscriptEntry[] = [
			cast(1, "alex"),
			learner(2, 1),
			cast(3, "luma"),
			{ id: 4, role: "cast", author: "zed", text: "so what do we think?" },
		];
		const moments = Array.from({ length: 30 }, (_, seed) =>
			drawSceneMoment({ ui: "reddit", language: "en", entries, scene, learnerName: "Maple", seed, participant: "op", world: true }),
		);
		const does = new Set(moments.map((moment) => moment?.around[0].does));
		expect(moments[0]?.around).toHaveLength(1);
		expect(moments[0]?.around[0]).toMatchObject({ name: "op" });
		expect([...does].some((line) => line === "answers #3" || line === "answers #4")).toBe(true);
		expect(does).toContain("a new top-level comment on the post");
		expect(moments.every((moment) => moment?.notes.includes("Nobody has picked up #4 (zed) yet."))).toBe(true);
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
