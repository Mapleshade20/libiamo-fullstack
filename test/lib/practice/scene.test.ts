import { describe, expect, it } from "vitest";
import { createMemberPool } from "$lib/practice/discord-members";
import { seededContact } from "$lib/practice/mail";
import { resolveCounterpart, resolveScene } from "$lib/practice/scene";

const opening = {
	previousMessages: [
		{ sender: "Maple", text: "hi" },
		{ sender: "Lucía", text: "¿Vamos?" },
	],
};

describe("resolveCounterpart", () => {
	it("prefers the authored counterpart name over the opening senders", () => {
		expect(resolveCounterpart("imessage", { ...opening, counterpartName: " Captain Shane " }, 1, "Maple")).toEqual({
			name: "Captain Shane",
			address: "",
		});
		expect(resolveCounterpart("discord", { counterpartName: "Shane" }, 1, "Maple").name).toBe("Shane");
		expect(
			resolveCounterpart(
				"apple_mail",
				{ counterpartName: "Captain Shane <shane@charters.example>", emails: [{ from: "Other <o@x.example>" }] },
				1,
				"Maple",
			),
		).toEqual({ name: "Captain Shane", address: "shane@charters.example" });
	});

	it("falls back to the first opening sender who is not the learner", () => {
		expect(resolveCounterpart("imessage", opening, 1, "Maple").name).toBe("Lucía");
		expect(resolveCounterpart("apple_mail", { emails: [{ from: "M. Durand <durand@x.example>" }] }, 1, "Maple").name).toBe("M. Durand");
	});

	it("gives a task without a named counterpart the same made-up identity its surface shows", () => {
		expect(resolveCounterpart("apple_mail", { emails: [] }, 7, "Maple")).toEqual(seededContact("7"));
		expect(resolveCounterpart("imessage", {}, 7, "Maple").name).toBe(seededContact(7).name);
		expect(resolveCounterpart("discord", null, 7, "Maple").name).toBe(createMemberPool("7").agent.name);
	});

	it("names the post or work author on comment threads", () => {
		expect(resolveCounterpart("reddit", { post: { author: "op_user" } }, 1, "Maple").name).toBe("op_user");
		expect(resolveCounterpart("ao3", {}, 1, "Maple").name).toBe("FicAuthor");
	});
});

describe("resolveScene", () => {
	it("keeps a one-to-one scene to the counterpart", () => {
		expect(resolveScene("imessage", opening, 1, "Maple")).toMatchObject({ group: false, open: false, cast: [{ name: "Lucía" }] });
		expect(resolveScene("discord", { dm: true, counterpartName: "fox" }, 1, "Maple")).toMatchObject({ group: false, cast: [{ name: "fox" }] });
	});

	it("gathers everyone the learner can see, counterpart first and never the learner", () => {
		const group = resolveScene(
			"imessage",
			{ counterpartName: "Priya", members: "Tom, Jess", previousMessages: [{ sender: "Tom", text: "hi" }] },
			1,
			"Maple",
		);
		expect(group).toMatchObject({ group: true, open: false });
		expect(group.cast.map((person) => person.name)).toEqual(["Priya", "Tom", "Jess"]);

		const mail = resolveScene(
			"apple_mail",
			{ counterpartName: "Hannah <h@x.example>", members: "Dana <d@x.example>", emails: [{ from: "Marco <m@x.example>" }] },
			1,
			"Maple",
		);
		expect(mail.cast).toEqual([
			{ name: "Hannah", address: "h@x.example" },
			{ name: "Marco", address: "m@x.example" },
			{ name: "Dana", address: "d@x.example" },
		]);

		const thread = resolveScene(
			"reddit",
			{ post: { author: "op" }, previousComments: [{ author: "alex", text: "x", replies: [{ author: "Maple", text: "y" }] }] },
			1,
			"Maple",
		);
		expect(thread).toMatchObject({ group: true, open: true });
		expect(thread.cast.map((person) => person.name)).toEqual(["op", "alex"]);
	});

	it("fills a quiet Discord channel with its online members, but not one whose opening already has a crowd", () => {
		const channel = resolveScene("discord", { counterpartName: "kiwi" }, 7, "Maple");
		expect(channel).toMatchObject({ group: true, open: true });
		expect(channel.cast.map((person) => person.name)).toEqual(["kiwi", ...createMemberPool("7").online.map((member) => member.name)]);

		const crowd = ["kiwi", "zote", "grub"].map((sender) => ({ sender, text: "…" }));
		expect(resolveScene("discord", { previousMessages: crowd }, 7, "Maple").cast.map((person) => person.name)).toEqual(["kiwi", "zote", "grub"]);
	});
});
