import { eq } from "drizzle-orm";
import type { Ao3OpeningState } from "$lib/components/practice-ui/ao3/helpers";
import { sanitizeDraftBodyHtml } from "$lib/components/practice-ui/mail/mailUtils";
import type { UiVariant } from "$lib/constants";
import { db } from "$lib/server/db";
import { practiceSession } from "$lib/server/db/schema";
import type { SendMessageOptions } from "$lib/server/session";
import { buildAo3SendOptions } from "./ao3";

type PracticeUiSendOptionsResult = { ok: true; options: SendMessageOptions } | { ok: false; status: number; error: string };

function getFormString(formData: FormData, key: string): string {
	const value = formData.get(key);
	return typeof value === "string" ? value.trim() : "";
}

async function buildAo3PracticeUiSendOptions(params: {
	formData: FormData;
	openingState: unknown;
	sessionId: number;
	message: string;
	clientMessageId: string;
	userName: string;
}): Promise<PracticeUiSendOptionsResult> {
	if (!params.clientMessageId) return { ok: false, status: 400, error: "clientMessageId is required for AO3 comments" };

	const sessionWithMessages = await db.query.practiceSession.findFirst({
		where: eq(practiceSession.id, params.sessionId),
		with: { messages: true },
	});
	const options = buildAo3SendOptions({
		openingState: (params.openingState ?? {}) as Ao3OpeningState,
		messages: sessionWithMessages?.messages ?? [],
		targetCommentId: getFormString(params.formData, "ao3TargetCommentId") || null,
		message: params.message,
		clientMessageId: params.clientMessageId,
		userName: params.userName,
	});

	if (!options) return { ok: false, status: 400, error: "Invalid AO3 reply target" };
	return { ok: true, options };
}

export async function buildPracticeUiSendOptions(params: {
	ui: UiVariant;
	formData: FormData;
	openingState: unknown;
	sessionId: number;
	message: string;
	clientMessageId: string;
	userName: string;
}): Promise<PracticeUiSendOptionsResult> {
	if (params.ui === "ao3") return buildAo3PracticeUiSendOptions(params);
	if (params.ui === "apple_mail") {
		const bodyHtml = sanitizeDraftBodyHtml(getFormString(params.formData, "bodyHtml"));
		return {
			ok: true,
			options: {
				userMetadata: bodyHtml ? { mailBodyHtml: bodyHtml } : undefined,
			},
		};
	}
	return { ok: true, options: {} };
}
