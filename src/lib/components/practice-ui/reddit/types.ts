export type RedditPost = {
	title: string;
	body: string;
	subreddit: string;
	author: string;
	votes?: number;
};

export type RedditComment = {
	author: string;
	text: string;
	votes?: number;
	parentId?: string;
};

export type RedditOpeningState = {
	post: RedditPost;
	previousComments?: RedditComment[];
};

export type CommentTreeNode = {
	id: string;
	author: string;
	authorColor: string;
	authorAvatarUrl?: string;
	text: string;
	timestamp: string;
	baseVotes: number;
	deliveryState?: "sent" | "pending" | "failed";
	role?: "user" | "agent";
	depth: number;
	children: CommentTreeNode[];
	parentId?: string;
	onRetry?: (id: string) => void;
	onReply?: (text: string, parentId: string) => void;
};

/** A single comment along the ancestor path, used for hint context extraction. */
export type ContextComment = {
	author: string;
	text: string;
};
