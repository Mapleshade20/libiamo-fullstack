import { describe, expect, it } from "vitest";
import { resolveCounterpart } from "$lib/practice/counterpart";
import { createMemberPool } from "$lib/practice/discord-members";
import { seededContact } from "$lib/practice/mail";

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
