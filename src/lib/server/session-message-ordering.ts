import { type AnyColumn, asc, type SQL } from "drizzle-orm";
import { sessionMessage } from "$lib/server/db/schema";

export const sessionMessageChronologicalOrder = [asc(sessionMessage.createdAt), asc(sessionMessage.id)];

export function orderSessionMessagesChronologically<T extends { createdAt: AnyColumn; id: AnyColumn }>(
	messages: T,
	operators: { asc: (column: AnyColumn) => SQL },
) {
	return [operators.asc(messages.createdAt), operators.asc(messages.id)];
}
