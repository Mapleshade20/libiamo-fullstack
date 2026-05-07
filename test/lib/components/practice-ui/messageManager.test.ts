import { describe, expect, it } from "vitest";
import { updateMessageById } from "$lib/components/practice-ui/messageManager";

describe("messageManager", () => {
	it("updates specific message by ID immutably", () => {
		const messages = [
			{ id: "1", text: "Old A" },
			{ id: "2", text: "Old B" },
		] as any[];

		const updated = updateMessageById(messages, "2", (m) => ({ ...m, text: "New B" }));

		expect(updated[0].text).toBe("Old A");
		expect(updated[1].text).toBe("New B");
		expect(updated).not.toBe(messages);
	});
});
