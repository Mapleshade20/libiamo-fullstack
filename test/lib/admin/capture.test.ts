import { describe, expect, it } from "vitest";
import { type Capture, cutCapture, joinChatAt, LEARNER_SEAT, parseCapture } from "$lib/admin/capture";
import { CAPTURE_SCRIPTS } from "$lib/admin/capture-scripts";
import { validateOpeningState } from "$lib/schemas";

const comment = (name: string, author: string, parent: string, created: number, replies: unknown[] = [], body = `${author} says hi`) => ({
	kind: "t1",
	data: { name, author, parent_id: parent, created_utc: created, body, replies: replies.length ? { data: { children: replies } } : "" },
});

const listing = [
	{
		kind: "Listing",
		data: {
			children: [{ kind: "t3", data: { title: "Best co-op?", selftext: "Asking for four.", subreddit: "boardgames", author: "op", created_utc: 5 } }],
		},
	},
	{
		kind: "Listing",
		data: {
			children: [
				comment("t1_b", "bea", "t3_x", 20, [comment("t1_c", "cam", "t1_b", 30)]),
				comment("t1_a", "ari", "t3_x", 10),
				comment("t1_d", "AutoModerator", "t3_x", 5),
				comment("t1_e", "[deleted]", "t3_x", 40, [comment("t1_f", "fay", "t1_e", 50)], "[removed]"),
			],
		},
	},
];

describe("reading a capture", () => {
	it("reads Reddit's own JSON for a post, oldest first, without bots, lifting replies to removed comments", () => {
		const parsed = parseCapture(JSON.stringify(listing));
		if (!parsed.success) throw new Error(parsed.error);
		expect(parsed.capture.messages.map(({ id, parent, author, time }) => [id, parent, author, time])).toEqual([
			["t1_a", null, "ari", "1970-01-01T00:00:10.000Z"],
			["t1_b", null, "bea", "1970-01-01T00:00:20.000Z"],
			["t1_c", "t1_b", "cam", "1970-01-01T00:00:30.000Z"],
			["t1_f", null, "fay", "1970-01-01T00:00:50.000Z"],
		]);
	});

	it("explains what is wrong with a paste that is not a capture", () => {
		expect(parseCapture("copied the wrong thing")).toMatchObject({ success: false });
		expect(parseCapture(JSON.stringify({ platform: "ao3", messages: [] }))).toMatchObject({ success: false });
	});

	it("ships console scripts that are valid JavaScript", () => {
		for (const script of Object.values(CAPTURE_SCRIPTS)) expect(() => new Function(script)).not.toThrow();
	});
});

describe("cutting a task from a capture", () => {
	const message = (id: string, author: string, parent: string | null = null) => ({ id, parent, author, text: `${author} ${id}` });

	it("opens a thread with the chosen comments and what they answer; the cast knows the rest, replies to the opening first", () => {
		const capture: Capture = {
			platform: "ao3",
			work: { title: "Stars", chapter: "Chapter 2", warnings: ["No Archive Warnings Apply"], characters: ["Shane"], stats: { kudos: "279" } },
			messages: [message("1", "kim"), message("2", "gd", "1"), message("3", "lu"), message("4", "kim", "2"), message("5", "mo", "3")],
		};
		const cut = cutCapture(capture, { opening: ["4"] });
		expect(cut.openingState).toMatchObject({
			workTitle: "Stars",
			chapterTitle: "Chapter 2",
			archiveWarning: "No Archive Warnings Apply",
			characters: ["Shane"],
			stats: { kudos: "279" },
			previousComments: [{ id: "1", replies: [{ id: "2", replies: [{ id: "4" }] }] }],
		});
		expect(cut.openingCount).toBe(3);
		expect(validateOpeningState("ao3", cut.openingState).success).toBe(true);
		expect(cut.continuation.split("\n")).toEqual(["lu: lu 3", "mo ↪ lu: mo 5"]);
	});

	it("shows Reddit times as the platform does, in the task's language", () => {
		const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
		const capture: Capture = {
			platform: "reddit",
			post: { title: "t", body: "b", subreddit: "s", author: "op", time: hourAgo },
			messages: [{ ...message("a", "ari"), time: hourAgo }],
		};
		const cut = cutCapture(capture, { opening: ["a"] }, "es");
		expect(cut.openingState).toMatchObject({ post: { timestamp: "hace 1 h" }, previousComments: [{ timestamp: "hace 1 h" }] });
		expect(validateOpeningState("reddit", cut.openingState).success).toBe(true);
	});

	it("joins a chat at a message: the latest lines before it, the seat anonymised in what follows", () => {
		const capture: Capture = {
			platform: "discord",
			serverName: "AstroNvim",
			channelName: "help",
			messages: [
				...Array.from({ length: 50 }, (_, index) => message(`m${index}`, `u${index % 5}`)),
				message("join", "seat"),
				message("next", "u1", "join"),
			],
		};
		const cut = cutCapture(capture, joinChatAt(capture, "join"));
		const lines = cut.openingState.previousMessages as Array<{ sender: string }>;
		expect(lines).toHaveLength(40);
		expect(validateOpeningState("discord", cut.openingState).success).toBe(true);
		expect(cut.continuation.split("\n")).toEqual([`${LEARNER_SEAT}: seat join`, `u1 ↪ ${LEARNER_SEAT}: u1 next`]);
	});
});
