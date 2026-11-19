/* The interface strings by language (scripts/vite-i18n.ts). */
declare module "virtual:i18n" {
	export const loaders: Record<string, () => Promise<{ default: Record<string, string> }>>;
}
