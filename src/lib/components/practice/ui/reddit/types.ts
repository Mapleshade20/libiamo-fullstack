export type RedditPost = {
	title: string;
	body: string;
	subreddit: string;
	author: string;
	votes?: number;
};

export type RedditOpeningState = {
	post?: Partial<RedditPost>;
};
