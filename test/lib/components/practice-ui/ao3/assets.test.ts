import { expect, it } from "vitest";
import { buildAo3CommentTree } from "$lib/components/practice-ui/ao3/helpers";

it.each(["", "/libiamo"])("resolves default icons under %j and preserves supplied icons", (basePath) => {
	const tree = buildAo3CommentTree({
		basePath,
		openingState: {
			previousComments: [
				{ id: "default", username: "Reader", comment: "Hello" },
				{ id: "supplied", username: "Author", comment: "Reply", iconUrl: "https://example.com/avatar.png" },
			],
		},
		messages: [],
	});
	expect(tree[0].iconUrl).toBe(`${basePath}/ao3/icon_user.png`);
	expect(tree[1].iconUrl).toBe("https://example.com/avatar.png");
});
