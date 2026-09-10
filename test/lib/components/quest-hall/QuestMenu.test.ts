import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import QuestMenu from "$lib/components/quest-hall/quest-menu/QuestMenu.svelte";
import QuestMenuBook from "$lib/components/quest-hall/quest-menu/QuestMenuBook.svelte";
import QuestMenuInbox from "$lib/components/quest-hall/quest-menu/QuestMenuInbox.svelte";
import QuestMenuSheet from "$lib/components/quest-hall/quest-menu/QuestMenuSheet.svelte";
import { adaptHallDataToQuestMenu } from "$lib/quest-hall/menu";
import type { HallLocation } from "$lib/quest-hall/navigation";

import { hallData, quest } from "../../../fixtures/quest-hall";

const home: HallLocation = { view: "home", section: "daily", leaf: 1, task: null };

describe("QuestMenu", () => {
	it.each([-1, 1] as const)("retains the translation year header on static and turning pages (direction: %s)", (direction) => {
		const catalog = adaptHallDataToQuestMenu(hallData(), "2026-09", "year");
		const spread = catalog.spreads.translation[0];
		const noop = () => {};
		const { body } = render(QuestMenuBook, {
			props: {
				ready: true,
				revealed: true,
				onrevealed: noop,
				renderPages: true,
				interactive: false,
				ribbons: [],
				view: "catalog",
				section: "translation",
				spread,
				folio: 1,
				turnPreview: {
					direction,
					fromSection: "translation",
					toSection: "translation",
					fromSpread: spread,
					toSpread: spread,
					fromFolio: 1,
					toFolio: 2,
				},
				unreadCount: 0,
				canTurnPrevious: true,
				canTurnNext: true,
				turning: true,
				lang: "en",
				translationMonth: "2026-09",
				onturn: noop,
				onmonthchange: noop,
				onselectsection: noop,
				onselectitem: noop,
			},
		});
		// One left page stays underneath, the other travels on the sheet.
		expect(body.match(/<time datetime="2026"/g)).toHaveLength(2);
	});

	it("server-renders the personalized home, recommendations, ribbons, and canonical links", () => {
		const { body } = render(QuestMenu, { props: { data: hallData(), initialLocation: home, lang: "en" } });

		expect(body).toContain("Good morning, Fedor");
		expect(body).toContain("Recommended");
		expect(body).toContain("Open menu");
		expect(body).toContain("Menu sections");
		expect(body).toContain(">MENU</strong>");
		expect(body).toContain('href="/task/1"');
		expect(body).toContain(">2</span>");
	});

	it("shows an exact accessible inbox total and caps the compact cover badge at nine", () => {
		const { body } = render(QuestMenu, {
			props: {
				data: hallData({ dailyTasks: [quest(1, { unreadCount: 10, hasUnreadReply: true })] }),
				initialLocation: home,
				lang: "en",
			},
		});

		const inbox = render(QuestMenuInbox, { props: { items: [], total: 10, status: "loading", lang: "en" } });
		expect(inbox.body).toContain("Replies: 10 unread replies");
		expect(body).toContain(">9+</span>");
	});

	// Finished conversations belong on the report, not the transcript; sending them to
	// /session also burns the read receipt, so the report loses its only entry point.
	it.each([
		["in_progress", "/task/1/session"],
		["abandoned", "/task/1/session"],
		["completed", "/task/1/feedback"],
		["evaluated", "/task/1/feedback"],
	] as const)("routes an unread %s conversation to %s", (sessionStatus, href) => {
		const { body } = render(QuestMenuInbox, {
			props: {
				items: [{ taskId: 1, title: "Quest 1", ui: "imessage", sessionStatus, unreadCount: 1, latestAgeSeconds: 60 }],
				total: 1,
				status: "ready",
				lang: "en",
			},
		});
		expect(body).toContain(`href="${href}"`);
	});

	it.each([
		["en", "MENU"],
		["es", "CARTA"],
		["fr", "CARTE"],
		["ja", "メニュー"],
	] as const)("server-renders the localized menu title for %s", (lang, title) => {
		const { body } = render(QuestMenu, {
			props: { data: hallData({ activeLanguage: lang }), initialLocation: home, lang },
		});

		expect(body).toContain(`>${title}</strong>`);
	});

	it("renders the closed book shell without mounting hidden catalog cards", () => {
		const { body } = render(QuestMenu, { props: { data: hallData(), initialLocation: home, lang: "en" } });

		expect(body).toContain('class="cover-face cover-face-back page page-left ');
		expect(body).toContain('class="book-surface book-deck book-deck-blank ');
		expect(body).toContain('class="book-edge book-edge-board book-edge-spine ');
		expect(body).not.toContain('class="task-card');
		// The real book stays hidden until fitted. No placeholder is painted.
		expect(body).not.toContain("static-cover");
		expect(body).not.toContain("is-revealing");
		expect(body).not.toMatch(/class="book-layer [^"]*is-ready/);
	});

	it.each(["home", "catalog"] as const)("keeps the three desktop section tabs inside the animated book in %s", (view) => {
		const { body } = render(QuestMenu, {
			props: { data: hallData(), initialLocation: { ...home, view }, lang: "en" },
		});
		const bookMarkup = body.slice(body.indexOf('class="book-layer'));
		expect(bookMarkup).toContain('class="book-ribbons');
		expect(bookMarkup.match(/role="tab"/g)).toHaveLength(3);
		expect(body).not.toContain('class="catalog-ribbons');
	});

	it("server-renders a direct catalog location with year controls and current-year production items", () => {
		const { body } = render(QuestMenu, {
			props: {
				data: hallData(),
				initialLocation: { view: "catalog", section: "translation", leaf: 1, task: null },
				lang: "en",
			},
		});

		expect(body).toContain("Choose a mission");
		expect(body).toContain("Current letter");
		expect(body).toContain('href="/translate/21"');
		expect(body).toContain('datetime="2026"');
		expect(body).toContain('aria-label="← 2026"');
		expect(body).toContain('aria-label="2026 →"');
		expect(body).toContain('class="month-folio');
		expect(body).not.toContain('class="month-press');
		expect(body).toContain("Archived letter");
	});

	it("populates both responsive catalog surfaces so CSS can switch layouts without an empty page", () => {
		const { body } = render(QuestMenu, {
			props: {
				data: hallData(),
				initialLocation: { view: "catalog", section: "daily", leaf: 1, task: null },
				lang: "en",
			},
		});

		// Both desktop and compact surfaces receive the selected daily category before client measurement.
		expect(body.match(/class="task-card\b/g)).toHaveLength(2);
	});

	it("server-renders an older translation preparation without mounting hidden catalog cards", () => {
		const data = hallData();
		const { body } = render(QuestMenu, {
			props: {
				data,
				initialLocation: { view: "prepare", section: "translation", leaf: 1, task: "translation-22" },
				initialPreparation: {
					kind: "translation",
					key: "translation-22",
					data: {
						template: {
							id: 22,
							title: "Archived letter",
							description: null,
							language: "en",
							translationReference: ["Reference"],
							context: "A letter",
							difficulty: 2,
							estimatedWords: null,
							pointReward: 3,
							gemReward: 30,
						},
						attempt: null,
						blockedReason: null,
					},
				},
				lang: "en",
			},
		});

		expect(body).toContain("Archived letter");
		expect(body).not.toContain('class="task-card');
	});

	it("keeps empty production sections navigable", () => {
		const { body } = render(QuestMenu, {
			props: {
				data: hallData({ dailyTasks: [], weeklyTasks: [], translationTasks: [] }),
				initialLocation: { view: "catalog", section: "daily", leaf: 1, task: null },
				lang: "en",
			},
		});

		expect(body).toContain("No quests available yet.");
		expect(body).toContain("Menu sections");
	});

	it.each([false, true])("shows translation empty state only for an empty catalog (empty: %s)", (empty) => {
		const data = hallData();
		data.translationTasks = empty ? [] : data.translationTasks.slice(0, 1);
		const { body } = render(QuestMenu, {
			props: {
				data,
				initialLocation: { view: "catalog", section: "translation", leaf: 1, task: null },
				lang: "en",
			},
		});
		expect(body.includes("No content available for translation yet.")).toBe(empty);
		if (!empty) expect(body).toContain("Current letter");
	});

	it("server-renders a directly selected quest in the preparation pane", () => {
		const data = hallData();
		const { body } = render(QuestMenu, {
			props: {
				data,
				initialLocation: { view: "prepare", section: "daily", leaf: 1, task: "daily-1" },
				initialPreparation: {
					kind: "quest",
					key: "daily-1",
					data: {
						nativeLanguage: "fr",
						task: {
							id: 1,
							title: "Prepared quest",
							description: "Detailed briefing",
							objectives: ["Reply naturally"],
							language: "en",
							templateInteractionType: "chat",
							templateUi: "imessage",
							templateDifficulty: 2,
							materialsMd: null,
							pointReward: 10,
							sessionStatus: null,
						},
					},
				},
				lang: "en",
			},
		});

		expect(body).toContain("Prepared quest");
		expect(body).toContain("Detailed briefing");
		expect(body).toContain('href="/task/1/session"');
	});
});

describe("compact mission catalog", () => {
	it.each(["daily", "weekly", "translation"] as const)("shows horizontal tabs and every %s card without task pagination", (section) => {
		const catalog = adaptHallDataToQuestMenu(hallData({ dailyTasks: [quest(1), quest(2), quest(3), quest(4)] }));
		const { body } = render(QuestMenuSheet, {
			props: {
				sections: catalog.sections,
				section,
				lang: "en",
				translationMonth: "2026-09",
				onclose: () => {},
				onselect: () => {},
				onmonthchange: () => {},
				onselectitem: () => {},
			},
		});
		expect(body.match(/<article\b/g)).toHaveLength(catalog.sections[section].length);
		for (const item of catalog.sections[section]) expect(body).toContain(`href="/${item.kind === "quest" ? "task" : "translate"}/${item.id}"`);
		expect(body.match(/role="tab"/g)).toHaveLength(3);
		expect(body).toContain('aria-orientation="horizontal"');
		expect(body).toContain(`aria-labelledby="mobile-tab-${section}"`);
		expect(body).not.toContain("<select");
		expect(body).not.toContain('aria-label="Previous mission"');
		expect(body).not.toContain('aria-label="Next mission"');
	});
});
