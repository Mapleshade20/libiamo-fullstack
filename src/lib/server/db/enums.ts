import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["learner", "admin"]);
export const languageCodeEnum = pgEnum("language_code", ["en", "es", "fr", "ja"]);
export const interactionTypeEnum = pgEnum("interaction_type", ["chat", "oneshot", "slow", "translate"]);
export const uiVariantEnum = pgEnum("ui_variant", ["reddit", "apple_mail", "discord", "imessage", "ao3", "translator"]);
export const cadenceEnum = pgEnum("cadence", ["weekly", "daily"]);
export const scheduleOriginEnum = pgEnum("schedule_origin", ["manual", "auto"]);
