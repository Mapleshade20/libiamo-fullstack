export type NotificationVariant = "success" | "error" | "info";

export type ActionNotificationContent = {
	variant: NotificationVariant;
	title?: string;
	message: string;
	key?: string | number;
};
