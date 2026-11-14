export type RedditPost = {
	title: string;
	body: string;
	subreddit: string;
	author: string;
	timestamp?: string;
};

export type RedditOpeningState = {
	post?: Partial<RedditPost>;
};
