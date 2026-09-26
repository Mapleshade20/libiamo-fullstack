import { z } from "zod";
import { env } from "$env/dynamic/private";
import type { LabProviderOption, ProviderRef } from "$lib/llm/lab";
import { getEnvOpenAIConfig, getUserOpenAIConfig, type LlmProviderRoute } from "./client";

const LabProviderSchema = z
	.object({
		id: z
			.string()
			.trim()
			.regex(/^[a-z0-9][a-z0-9_-]*$/i),
		label: z.string().trim().min(1).optional(),
		baseUrl: z.string().trim().url(),
		apiKey: z.string().trim().min(1),
		model: z.string().trim().min(1),
	})
	.strict();

type LabProvider = z.infer<typeof LabProviderSchema>;

let cached: { raw: string | undefined; providers: LabProvider[] } | null = null;

/** `LLM_LAB_PROVIDERS`: a JSON array of `{ id, label?, baseUrl, apiKey, model }`. Invalid entries are skipped. */
export function labProviders(raw = env.LLM_LAB_PROVIDERS): LabProvider[] {
	if (cached && cached.raw === raw) return cached.providers;
	let providers: LabProvider[] = [];
	if (raw?.trim()) {
		try {
			const parsed: unknown = JSON.parse(raw);
			providers = (Array.isArray(parsed) ? parsed : []).flatMap((entry, index) => {
				const result = LabProviderSchema.safeParse(entry);
				if (!result.success) console.warn(`Ignoring LLM_LAB_PROVIDERS[${index}]: ${result.error.issues[0]?.message ?? "invalid"}`);
				return result.success ? [result.data] : [];
			});
		} catch {
			console.warn("Ignoring LLM_LAB_PROVIDERS: not valid JSON.");
		}
	}
	cached = { raw, providers };
	return providers;
}

export function isProviderRef(value: string): value is ProviderRef {
	return value === "default" || value === "byok" || /^lab:[a-z0-9][a-z0-9_-]*$/i.test(value);
}

/** Providers a staff member can choose, without credentials. */
export async function listProviderOptions(actorId: string): Promise<LabProviderOption[]> {
	const options: LabProviderOption[] = [];
	try {
		options.push({ ref: "default", label: "Shared provider", model: getEnvOpenAIConfig().model });
	} catch {
		// The shared provider is not configured.
	}
	const byok = await getUserOpenAIConfig(actorId).catch(() => null);
	if (byok) options.push({ ref: "byok", label: "My API key", model: byok.model });
	for (const provider of labProviders()) options.push({ ref: `lab:${provider.id}`, label: provider.label ?? provider.id, model: provider.model });
	return options;
}

export class ProviderUnavailableError extends Error {
	constructor(ref: string) {
		super(`Provider "${ref}" is not available.`);
		this.name = "ProviderUnavailableError";
	}
}

/**
 * The explicit route for a provider ref, acting as `actorId` (whose BYOK key `byok` means).
 * Explicit routes never debit trial quota.
 */
export async function resolveProviderRef(ref: ProviderRef, actorId: string): Promise<LlmProviderRoute> {
	if (ref === "default") return { id: "default", ...getEnvOpenAIConfig() };
	if (ref === "byok") {
		const config = await getUserOpenAIConfig(actorId);
		if (!config) throw new ProviderUnavailableError(ref);
		return { id: "byok", ...config };
	}
	const provider = labProviders().find((entry) => `lab:${entry.id}` === ref);
	if (!provider) throw new ProviderUnavailableError(ref);
	return { id: ref, apiKey: provider.apiKey, baseUrl: provider.baseUrl, model: provider.model };
}
