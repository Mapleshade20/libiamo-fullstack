import { describe, expect, it } from "vitest";
import { type Access, accessOf, type Visitor } from "#lib/server/access.ts";

const out: Visitor = null;
const fresh: Visitor = { onboarded: false, admin: false };
const learner: Visitor = { onboarded: true, admin: false };
const admin: Visitor = { onboarded: true, admin: true };
const go: Access = { go: true };
const to = (redirect: string): Access => ({ redirect });

// Each row: a path, then what each visitor gets — signed out, signed up but not set up, a learner, an admin.
const RULES: [string, Access, Access, Access, Access][] = [
	// The site's address: what Libiamo is for a visitor, the app for a learner.
	["/", to("/about"), to("/welcome"), go, go],
	// Documents answer anyone.
	["/about", go, go, go, go],
	["/privacy", go, go, go, go],
	["/terms", go, go, go, go],
	["/changelog", go, go, go, go],
	// The way in: a signed-in visitor is sent on from the sign-in and sign-up pages, not from the others.
	["/sign-in", go, to("/welcome"), to("/"), to("/")],
	["/sign-up", go, to("/welcome"), to("/"), to("/")],
	["/verify", go, go, go, go],
	["/forgot-password", go, go, go, go],
	// Setting up comes first; nothing else opens until it is done.
	["/welcome", to("/sign-in"), go, go, go],
	["/notebook", to("/sign-in"), to("/welcome"), go, go],
	["/scenario/ao3-fic/play", to("/sign-in"), to("/welcome"), go, go],
	// The admin's pages do not exist for anyone else.
	["/admin", to("/sign-in"), to("/welcome"), { status: 404 }, go],
	["/admin/users/u1", to("/sign-in"), to("/welcome"), { status: 404 }, go],
	["/administrator", to("/sign-in"), to("/welcome"), go, go],
	// Endpoints answer 401, never a redirect; Better Auth and the probe answer anyone.
	["/api/s", { status: 401 }, go, go, go],
	["/api/collect/explain", { status: 401 }, go, go, go],
	["/api/auth/sign-in/email", go, go, go, go],
	["/health", go, go, go, go],
	["/robots.txt", go, go, go, go],
	// Remote functions check the learner themselves.
	["/_app/remote/abc/placeOf", go, go, go, go],
];

describe("accessOf", () => {
	it.each(RULES)("%s", (path, ...expected) => {
		expect([out, fresh, learner, admin].map((v) => accessOf(path, v))).toEqual(expected);
	});

	it("sends a page's data asked for after the session ended to the sign-in page, not the public one", () => {
		expect(accessOf("/", null, true)).toEqual(to("/sign-in"));
		expect(accessOf("/", null, false)).toEqual(to("/about"));
	});
});
