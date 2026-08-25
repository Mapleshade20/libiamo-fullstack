import { pgEnum } from "drizzle-orm/pg-core";
import { CADENCES, INTERACTION_TYPES, LANGUAGE_CODES, UI_VARIANTS, URGENCIES } from "$lib/constants";

export const userRoleEnum = pgEnum("user_role", ["learner", "admin"]);
export const languageCodeEnum = pgEnum("language_code", [...LANGUAGE_CODES]);
export const interactionTypeEnum = pgEnum("interaction_type", [...INTERACTION_TYPES]);
export const uiVariantEnum = pgEnum("ui_variant", [...UI_VARIANTS]);
export const cadenceEnum = pgEnum("cadence", [...CADENCES]);
export const scheduleOriginEnum = pgEnum("schedule_origin", ["manual", "auto"]);
export const sessionStatusEnum = pgEnum("session_status", ["in_progress", "completed", "evaluated", "abandoned"]);
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant"]);
export const urgencyEnum = pgEnum("urgency", [...URGENCIES]);
export const sessionCompletionReasonEnum = pgEnum("session_completion_reason", [
	"user_requested",
	"max_turns",
	"max_session_age",
	"terminated_abuse",
]);
export const agentResponseBatchKindEnum = pgEnum("agent_response_batch_kind", ["opening", "reply", "follow_up"]);
export const agentResponseBatchStatusEnum = pgEnum("agent_response_batch_status", [
	"pending",
	"processing",
	"stale",
	"delivery_pending",
	"completed",
	"no_reply",
	"failed",
	"cancelled",
	"terminated",
]);
export const agentDeliveryStatusEnum = pgEnum("agent_delivery_status", ["pending", "delivered", "cancelled"]);
