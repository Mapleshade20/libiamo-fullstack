import { z } from "zod";
import { AUTH_EMAIL_MAX_LENGTH, AUTH_PASSWORD_MAX_LENGTH, AUTH_TOKEN_MAX_LENGTH, LANGUAGE_CODES, USER_NAME_MAX_LENGTH } from "$lib/constants";
import { timezoneSchema } from "./settings";

export const signInSchema = z.object({
	email: z.email("Invalid email").max(AUTH_EMAIL_MAX_LENGTH),
	password: z.string().min(1, "Password is required").max(AUTH_PASSWORD_MAX_LENGTH),
});

export const signUpSchema = z.object({
	email: z.email("Invalid email").max(AUTH_EMAIL_MAX_LENGTH),
	password: z.string().min(8, "Password must be at least 8 characters").max(AUTH_PASSWORD_MAX_LENGTH),
	name: z.string().min(1, "Name is required").max(USER_NAME_MAX_LENGTH),
	activeLanguage: z.enum(LANGUAGE_CODES, { message: "Please select a language" }),
	timezone: timezoneSchema,
});

export const forgotPasswordSchema = z.object({
	email: z.email("Invalid email").max(AUTH_EMAIL_MAX_LENGTH),
});

export const resetPasswordSchema = z.object({
	newPassword: z.string().min(8, "Password must be at least 8 characters").max(AUTH_PASSWORD_MAX_LENGTH),
	token: z.string().min(1, "Invalid token").max(AUTH_TOKEN_MAX_LENGTH),
});
