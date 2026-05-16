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
	bodyAlign?: "left" | "right";
};

export type NormalizedMailEmail = MailEmail & {
	id: string;
	preview: string;
	fromName: string;
	fromAddress: string;
	displayFrom: string;
};

export type MailHint = {
	nextSection: {
		title: string;
		text: string;
	};
	nextSentence: {
		title: string;
		text: string;
	};
	checklist: Array<{
		text: string;
		done: boolean;
		note: string;
	}>;
};
