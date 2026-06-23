import type { ActionNotificationContent } from "$lib/notifications";

export const QUOTA_NOTICE_EVENT = "libiamo:quota-notice";

type QuotaNoticePayload = {
	kind?: "low" | "depleted";
	title?: string;
	message?: string;
	href?: string;
};

export function quotaNoticeToNotification(notice: QuotaNoticePayload): ActionNotificationContent {
	const depleted = notice.kind === "depleted";
	return {
		variant: depleted ? "error" : "info",
		title: notice.title ?? (depleted ? "Trial balance depleted" : "Trial balance running low"),
		message:
			notice.message ??
			(depleted
				? "Your free AI trial balance is depleted. Add your own API key to continue."
				: "Your free AI trial balance is below 10%. Add your own API key to avoid interruption."),
		actionHref: notice.href ?? "/profile",
		actionLabel: "Configure API key",
		key: `${notice.kind ?? "quota"}:${Date.now()}`,
	};
}

export function dispatchQuotaNotice(notice: unknown) {
	if (!notice || typeof window === "undefined") return;
	window.dispatchEvent(
		new CustomEvent<ActionNotificationContent>(QUOTA_NOTICE_EVENT, { detail: quotaNoticeToNotification(notice as QuotaNoticePayload) }),
	);
}

export function dispatchQuotaNoticeFromData(data: unknown) {
	if (!data || typeof data !== "object") return;
	const directNotice = (data as { quotaNotice?: unknown }).quotaNotice;
	const actionDataNotice = (data as { data?: { quotaNotice?: unknown } }).data?.quotaNotice;
	const quotaNotice = directNotice ?? actionDataNotice;
	if (quotaNotice) dispatchQuotaNotice(quotaNotice);
}
