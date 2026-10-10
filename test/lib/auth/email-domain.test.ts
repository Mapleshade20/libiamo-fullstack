import { describe, expect, it } from "vitest";
import { isTrustedEmailDomain, trialEmailKey } from "$lib/auth/email-domain";

describe("isTrustedEmailDomain", () => {
	it.each([
		"a@gmail.com",
		"a@QQ.com",
		"a@foxmail.com",
		"a@126.com",
		"a@163.com",
		"a@sina.cn",
		"a@yahoo.com",
		"a@microsoft.com",
	])("trusts listed provider %s", (email) => expect(isTrustedEmailDomain(email)).toBe(true));

	it.each(["a@mit.edu", "a@cs.stanford.edu", "a@pku.edu.cn", "a@mail.ox.edu.au"])("trusts educational domain %s", (email) =>
		expect(isTrustedEmailDomain(email)).toBe(true));

	it.each([
		"a@mailinator.com",
		"a@icloud.com",
		"a@mail.gmail.com",
		"a@gmail.com.evil.io",
		"a@edu.com",
		"a@x.edu.com",
		"a@edu",
		"a@.edu",
		"gmail.com",
		"a@",
	])("rejects %s", (email) => expect(isTrustedEmailDomain(email)).toBe(false));
});

describe("trialEmailKey", () => {
	it("maps Gmail dot and plus variants to one mailbox", () => {
		const key = trialEmailKey("john@gmail.com");
		for (const email of ["j.ohn@gmail.com", "John+1@Gmail.com", "j.o.h.n+x+y@googlemail.com"]) {
			expect(trialEmailKey(email)).toBe(key);
		}
	});

	it("drops subaddresses but keeps dots on other providers", () => {
		expect(trialEmailKey("a.b+promo@qq.com")).toBe("a.b@qq.com");
		expect(trialEmailKey("a.b@qq.com")).not.toBe(trialEmailKey("ab@qq.com"));
	});

	it("keeps different mailboxes apart", () => {
		expect(trialEmailKey("john@gmail.com")).not.toBe(trialEmailKey("john@yahoo.com"));
		expect(trialEmailKey("john@gmail.com")).not.toBe(trialEmailKey("johnny@gmail.com"));
	});
});
