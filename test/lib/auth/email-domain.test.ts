import { describe, expect, it } from "vitest";
import { isTrustedEmailDomain } from "$lib/auth/email-domain";

describe("isTrustedEmailDomain", () => {
	it.each([
		"a@gmail.com",
		"a@QQ.com",
		"a@foxmail.com",
		"a@126.com",
		"a@163.com",
		"a@icloud.com",
		"a@sina.cn",
		"a@yahoo.com",
		"a@microsoft.com",
	])("trusts listed provider %s", (email) => expect(isTrustedEmailDomain(email)).toBe(true));

	it.each(["a@mit.edu", "a@cs.stanford.edu", "a@pku.edu.cn", "a@mail.ox.edu.au"])("trusts educational domain %s", (email) =>
		expect(isTrustedEmailDomain(email)).toBe(true));

	it.each([
		"a@mailinator.com",
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
