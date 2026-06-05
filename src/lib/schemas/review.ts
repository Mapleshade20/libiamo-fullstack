import { z } from "zod";

export const reviewRatingSchema = z.object({
	rating: z.number().int().min(1).max(4),
	elapsedSeconds: z.number().int().min(0),
});

export const reviewCreateCardSchema = z.object({
	noteId: z.number().int().positive(),
});
