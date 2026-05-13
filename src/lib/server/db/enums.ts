import { pgEnum } from "drizzle-orm/pg-core";
import { CADENCES, INTERACTION_TYPES, LANGUAGE_CODES, UI_VARIANTS } from "$lib/constants";

export const userRoleEnum = pgEnum("user_role", ["learner", "admin"]);
export const languageCodeEnum = pgEnum("language_code", [...LANGUAGE_CODES]);
export const interactionTypeEnum = pgEnum("interaction_type", [...INTERACTION_TYPES]);
export const uiVariantEnum = pgEnum("ui_variant", [...UI_VARIANTS]);
export const cadenceEnum = pgEnum("cadence", [...CADENCES]);
export const scheduleOriginEnum = pgEnum("schedule_origin", ["manual", "auto"]);
export const sessionStatusEnum = pgEnum("session_status", ["in_progress", "completed", "evaluated"]);
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant"]);
