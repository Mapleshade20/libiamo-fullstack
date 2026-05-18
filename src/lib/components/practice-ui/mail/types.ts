export type MailEmail = {
	from: string;
	to: string;
	subject: string;
	body: string;
	time?: string;
};

export type MailOpeningState = {
	emails?: MailEmail[];
};

export type DraftEmail = {
	to: string;
	subject: string;
	body: string;
	bodyHtml?: string;
};

export type NormalizedMailEmail = MailEmail & {
	id: string;
	preview: string;
	fromName: string;
	fromAddress: string;
	displayFrom: string;
	deliveryState?: "sent" | "pending" | "failed";
	clientMessageId?: string;
	retryText?: string;
	messageId?: string;
};

export type MailHint = {
	subjectSuggestion?: {
		text: string;
	} | null;
	nextSection?: {
		title: string;
		text: string;
	} | null;
	nextSentence?: {
		title: string;
		text: string;
	} | null;
	checklist?: Array<{
		text: string;
		done: boolean;
		note: string;
	}>;
};
