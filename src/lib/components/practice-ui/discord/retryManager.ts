class MessageRetryManager {
	private retryResolvers = new Map<string, () => void>();

	waitForRetry(messageId: string): Promise<void> {
		return new Promise((resolve) => {
			this.retryResolvers.set(messageId, resolve);
		});
	}

	resolveRetry(messageId: string): boolean {
		const resolve = this.retryResolvers.get(messageId);
		if (resolve) {
			resolve();
			this.retryResolvers.delete(messageId);
			return true;
		}
		return false;
	}

	clear(messageId: string) {
		this.retryResolvers.delete(messageId);
	}
}

export const retryManager = new MessageRetryManager();
