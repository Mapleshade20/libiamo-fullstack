/*
 * What a place asks of the server, as the play page provides it (lib/exchange/exchange.remote.ts): the surfaces and
 * their controller never call a remote function themselves, so a test or the tour can hand them another.
 *
 * `failed`: the message may be resent as is (the reply or the server failed). `rejected`: the server refused this
 * message (validation, a turn limit, an exchange already over), so it was not stored and resending it would be refused
 * again.
 */
export type SendResult =
	| { status: "pending" }
	| { status: "failed" }
	| { status: "rejected"; reason: SendRejection }
	| { status: "exchange_completed" };
/** `closed`: the exchange is over or its turns are used up (another tab, an expiry); `nokey`: no key to answer on
 *  (the play page says so already, unless the key went in another tab); `invalid`: a message the place should not have
 *  let through (empty, too long, a reply to nothing). Pages word them; the server sends no words. */
export type SendRejection = "closed" | "nokey" | "invalid";

export type HintMode = "content" | "expression";
/** What the learner is writing and, in threads, the comments it answers. */
export type HintContext = { draft: string; contextPath?: Array<{ author: string; text: string }> };
export type HintResponse = { contentHint?: string; phrases?: string[] };

export type ExchangeApi = {
	/** Opens the exchange; the page's state then shows it. */
	start(): Promise<void>;
	/** One learner message with the place's fields (the comment it answers, a mail's subject); the reply is composed
	 *  in the background. */
	send(fields: Record<string, string>): Promise<SendResult>;
	/** Ends the exchange; throws when it could not. */
	finish(): Promise<void>;
	/** Reads the exchange again. */
	refresh(): Promise<void>;
	hint(input: HintContext & { mode: HintMode; expression?: string }): Promise<HintResponse>;
	/** The learner has seen the replies up to this message. */
	read(messageId: number): Promise<void>;
};
